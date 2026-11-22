/**
 * CodeRabbit CLI レビュー実行・指摘構造化抽出・修正後一括検証ワークフロー補助スクリプト
 *
 * 主な使い方:
 * - レビュー実行（既定: review ブランチ比較）:
 *   node scripts/coderabbit_workflow.js review
 * - main ブランチ比較でレビュー実行:
 *   node scripts/coderabbit_workflow.js review --base main
 * - 未コミット変更のみレビュー実行:
 *   node scripts/coderabbit_workflow.js review --uncommitted
 * - 直近のローカルレビュー結果のみ再取得・整形:
 *   node scripts/coderabbit_workflow.js review --findings-only
 * - 修正対象ファイルのフォーマット＋Lint＋全テスト＋本番ビルド一括検証:
 *   node scripts/coderabbit_workflow.js verify src/game/ai_normal.js src/styles/style.css
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

/** デフォルトの比較先ベースブランチ */
const DEFAULT_BASE_BRANCH = 'review';

/** デフォルトの CodeRabbit 設定ファイルパス */
const DEFAULT_CONFIG_PATH = '.coderabbit.yaml';

/** レビュー出力の既定保存先（.gitignore の logs ルール配下） */
const DEFAULT_OUT_DIR = path.join('logs', 'coderabbit');

/** Prettier 適用対象の拡張子一覧（画像・音声アセット変換を巻き込まない安全なテキスト拡張子のみ） */
const PRETTIER_TARGET_EXTENSIONS = new Set([
  '.js',
  '.jsx',
  '.cjs',
  '.mjs',
  '.json',
  '.css',
  '.scss',
  '.md',
  '.yaml',
  '.yml',
  '.html',
]);

/** 重要度ソート用の優先順位マップ */
const SEVERITY_ORDER = {
  critical: 0,
  major: 1,
  minor: 2,
  trivial: 3,
  info: 4,
  unknown: 5,
};

/**
 * 文字列から ANSI エスケープシーケンス（カラーコード等）を除去する。
 *
 * @param {string} text - 入力文字列
 * @returns {string} ANSI シーケンスを除去したプレーンテキスト
 */
function stripAnsi(text) {
  if (typeof text !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

/**
 * CLI ヘルプメッセージを標準出力へ表示する。
 *
 * @returns {void}
 */
function printHelp() {
  console.log(
    `
CodeRabbit レビュー＆検証ワークフロー補助ツール

使い方:
  node scripts/coderabbit_workflow.js <subcommand> [options]

サブコマンド:
  review                CodeRabbit CLI レビューを実行し、指摘一覧と詳細を出力します
  verify [files...]     指定ファイルの Prettier + ESLint + 既存テスト全件 + 本番ビルドを一括実行します
  help                  このヘルプを表示します

[review オプション]
  --base <branch>       比較対象のベースブランチ（既定: ${DEFAULT_BASE_BRANCH}）
  --base-commit <sha>   比較対象のベースコミットハッシュ
  --uncommitted         ステージ済み・未コミットの追跡変更のみをレビュー（--base 無指定時は単体動作）
  --committed           コミット済み変更のみをレビュー
  --include-untracked   Git 未追跡ファイルもレビュー対象に含める
  --dir <path>          指定ディレクトリ配下の変更のみをレビュー
  --light               コンテキスト探索を抑えた軽量レビューを実行
  --config <path>       CodeRabbit 設定ファイル（既定: ${DEFAULT_CONFIG_PATH}）
  --findings-only       新規レビューを実行せず、直近のローカルレビュー結果のみを再整形して出力
  --out-dir <dir>       結果ファイルの出力先ディレクトリ（既定: ${DEFAULT_OUT_DIR}）

[verify オプション]
  --files <f1> <f2>...  Prettier を適用する変更対象ファイル群（位置引数として直接列挙も可）
  --skip-tests          既存テストスクリプト（scripts/test_*.js）の実行をスキップ（途中確認用）
  --skip-build          本番ビルド検証をスキップ（※完了報告前の最終検証では使用禁止）
`.trim()
  );
}

/**
 * `review` サブコマンドの CLI 引数配列を解析して設定オブジェクトを構築する。
 *
 * @param {string[]} args - サブコマンド以降の CLI 引数配列
 * @returns {{
 *   base: string | null,
 *   baseExplicit: boolean,
 *   baseCommit: string | null,
 *   uncommitted: boolean,
 *   committed: boolean,
 *   includeUntracked: boolean,
 *   dir: string | null,
 *   light: boolean,
 *   configPath: string,
 *   findingsOnly: boolean,
 *   outDir: string
 * }} 解析済みオプション
 */
function parseReviewArgs(args) {
  const opts = {
    base: DEFAULT_BASE_BRANCH,
    baseExplicit: false,
    baseCommit: null,
    uncommitted: false,
    committed: false,
    includeUntracked: false,
    dir: null,
    light: false,
    configPath: DEFAULT_CONFIG_PATH,
    findingsOnly: false,
    outDir: DEFAULT_OUT_DIR,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--base' && i + 1 < args.length) {
      opts.base = args[++i];
      opts.baseExplicit = true;
    } else if (arg.startsWith('--base=')) {
      opts.base = arg.slice('--base='.length);
      opts.baseExplicit = true;
    } else if (arg === '--base-commit' && i + 1 < args.length) {
      opts.baseCommit = args[++i];
    } else if (arg.startsWith('--base-commit=')) {
      opts.baseCommit = arg.slice('--base-commit='.length);
    } else if (arg === '--uncommitted') {
      opts.uncommitted = true;
    } else if (arg === '--committed') {
      opts.committed = true;
    } else if (arg === '--include-untracked') {
      opts.includeUntracked = true;
    } else if (arg === '--dir' && i + 1 < args.length) {
      opts.dir = args[++i];
    } else if (arg.startsWith('--dir=')) {
      opts.dir = arg.slice('--dir='.length);
    } else if (arg === '--light') {
      opts.light = true;
    } else if ((arg === '--config' || arg === '-c') && i + 1 < args.length) {
      opts.configPath = args[++i];
    } else if (arg.startsWith('--config=')) {
      opts.configPath = arg.slice('--config='.length);
    } else if (arg === '--findings-only') {
      opts.findingsOnly = true;
    } else if (arg === '--out-dir' && i + 1 < args.length) {
      opts.outDir = args[++i];
    } else if (arg.startsWith('--out-dir=')) {
      opts.outDir = arg.slice('--out-dir='.length);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`未対応のオプションです: ${arg}`);
    }
  }

  // --uncommitted または --base-commit が指定され、--base が明示されていない場合は --base を付与しない
  if ((opts.uncommitted || opts.baseCommit) && !opts.baseExplicit) {
    opts.base = null;
  }

  return opts;
}

/**
 * `verify` サブコマンドの CLI 引数配列を解析して設定オブジェクトを構築する。
 *
 * @param {string[]} args - サブコマンド以降の CLI 引数配列
 * @returns {{
 *   files: string[],
 *   skipTests: boolean,
 *   skipBuild: boolean
 * }} 解析済みオプション
 */
function parseVerifyArgs(args) {
  const opts = {
    files: [],
    skipTests: false,
    skipBuild: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--files') {
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        opts.files.push(args[++i]);
      }
    } else if (arg === '--skip-tests') {
      opts.skipTests = true;
    } else if (arg === '--skip-build') {
      opts.skipBuild = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (arg.startsWith('--')) {
      throw new Error(`未対応のオプションです: ${arg}`);
    } else {
      opts.files.push(arg);
    }
  }

  return opts;
}

/**
 * 外部コマンドを同期実行し、終了コード・標準出力・標準エラー出力を返す。
 * Windows 環境で `.cmd` ラッパーだった場合の `EINVAL` にも安全にフォールバックする。
 *
 * @param {string} command - 実行コマンド名またはバイナリパス
 * @param {string[]} args - 引数配列
 * @param {{ stdio?: 'pipe' | 'inherit', cwd?: string }} [options={}] - 実行オプション
 * @returns {{ status: number, stdout: string, stderr: string, error?: Error }} 実行結果
 */
function execSyncSafe(command, args, options = {}) {
  const cwd = options.cwd || PROJECT_ROOT;
  const stdio = options.stdio || 'pipe';

  let res = spawnSync(command, args, {
    cwd,
    stdio,
    encoding: 'utf8',
    shell: false,
  });

  if (
    res.error &&
    process.platform === 'win32' &&
    (res.error.code === 'EINVAL' || res.error.code === 'ENOENT') &&
    !/[&|<>^%\r\n]/.test([command, ...args].join(' '))
  ) {
    res = spawnSync(command, args, {
      cwd,
      stdio,
      encoding: 'utf8',
      shell: true,
    });
  }

  return {
    status: res.status ?? 1,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    error: res.error,
  };
}

/**
 * 指定された Git リファレンス（ブランチまたはコミット）がローカルリポジトリに存在するか解決する。
 * ローカルブランチが見つからない場合、`origin/<ref>` が存在すればそちらを返す。
 *
 * @param {string} refName - 確認対象のブランチ名またはコミット識別子
 * @returns {string | null} 利用可能な Git リファレンス名（存在しない場合は null）
 */
function resolveGitRef(refName) {
  if (!refName || !/^[A-Za-z0-9._\-/~^]+$/.test(refName)) {
    return null;
  }
  const direct = execSyncSafe('git', [
    'rev-parse',
    '--verify',
    '--quiet',
    refName,
  ]);
  if (direct.status === 0) {
    return refName;
  }
  const remoteCandidate = `origin/${refName}`;
  const remote = execSyncSafe('git', [
    'rev-parse',
    '--verify',
    '--quiet',
    remoteCandidate,
  ]);
  if (remote.status === 0) {
    return remoteCandidate;
  }
  return null;
}

/**
 * `coderabbit review --agent` をストリーミング実行し、JSONL イベント列と終了コードを収集する。
 *
 * @param {string[]} cliArgs - `coderabbit` に渡す引数配列
 * @returns {Promise<{
 *   exitCode: number,
 *   rawStdout: string,
 *   rawStderr: string,
 *   events: Array<object>
 * }>} 実行結果とパース済み JSONL イベント配列
 */
function runCodeRabbitAgentStream(cliArgs) {
  return new Promise((resolve, reject) => {
    let useShell = false;
    /**
     * 子プロセスを起動してストリーム監視を開始する内部ヘルパー。
     * @param {boolean} shellFlag - シェル経由で起動する場合は true
     * @returns {void}
     */
    const launch = (shellFlag) => {
      const child = spawn('coderabbit', cliArgs, {
        cwd: PROJECT_ROOT,
        shell: shellFlag,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let rawStdout = '';
      let rawStderr = '';
      let lineBuffer = '';
      let heartbeatCount = 0;
      const events = [];

      /**
       * 1行分の標準出力を解析し、JSONL イベントであれば記録・進捗表示を行う。
       * @param {string} rawLine - 改行を除いた1行テキスト
       * @returns {void}
       */
      const handleLine = (rawLine) => {
        const trimmed = stripAnsi(rawLine).trim();
        if (!trimmed) return;
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try {
            const parsed = JSON.parse(trimmed);
            events.push(parsed);
            if (parsed.type === 'review_context') {
              console.log(
                `[CodeRabbit] 対象ブランチ: current=${parsed.currentBranch || '(detached)'}, base=${parsed.baseBranch || '(working-tree)'}, mode=${parsed.reviewType || 'default'}`
              );
            } else if (parsed.type === 'status') {
              console.log(
                `[CodeRabbit] ステータス: ${parsed.phase || ''} / ${parsed.status || ''}`
              );
            } else if (parsed.type === 'heartbeat') {
              heartbeatCount += 1;
              if (heartbeatCount % 5 === 1) {
                console.log(
                  `[CodeRabbit] 解析進行中... (heartbeat #${heartbeatCount})`
                );
              }
            } else if (parsed.type === 'finding') {
              console.log(
                `[CodeRabbit] 指摘検出: [${parsed.severity || 'unknown'}] ${parsed.fileName || '(file unknown)'}`
              );
            } else if (parsed.type === 'complete') {
              console.log(
                `[CodeRabbit] レビュー完了: 指摘合計 ${parsed.findings ?? 0} 件（対象ファイル ${(parsed.reviewedFiles || []).length} 件）`
              );
            }
            return;
          } catch {
            // JSON パース失敗時は通常テキスト行として扱う
          }
        }
        console.log(`[CodeRabbit] ${trimmed}`);
      };

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        rawStdout += chunk;
        lineBuffer += chunk;
        const lines = lineBuffer.split(/\r?\n/);
        lineBuffer = lines.pop() || '';
        for (const line of lines) {
          handleLine(line);
        }
      });

      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        rawStderr += chunk;
      });

      child.on('error', (err) => {
        if (
          !useShell &&
          process.platform === 'win32' &&
          (err.code === 'EINVAL' || err.code === 'ENOENT')
        ) {
          useShell = true;
          launch(true);
          return;
        }
        reject(err);
      });

      child.on('close', (code) => {
        if (lineBuffer.trim()) {
          handleLine(lineBuffer);
        }
        resolve({
          exitCode: code ?? 1,
          rawStdout,
          rawStderr,
          events,
        });
      });
    };

    launch(false);
  });
}

/**
 * `coderabbit review findings` のプレーンテキスト出力を個別指摘オブジェクト配列へ構造化パースする。
 *
 * @param {string} findingsText - `coderabbit review findings` の標準出力文字列
 * @returns {{
 *   headerInfo: string,
 *   items: Array<{
 *     index: number,
 *     severity: string,
 *     category: string,
 *     location: string,
 *     file: string,
 *     lines: string,
 *     title: string,
 *     alsoAppliesTo: string | null,
 *     body: string
 *   }>
 * }} ヘッダ情報と構造化済み指摘リスト
 */
function parseFindingsDetailText(findingsText) {
  const cleaned = stripAnsi(findingsText).replace(/\r\n/g, '\n');
  const sections = cleaned.split(/^─{20,}\s*$/m);
  const headerInfo = (sections[0] || '').trim();
  const rawBlocks = sections.slice(1);

  const items = [];
  for (const block of rawBlocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    const lines = trimmedBlock.split('\n');
    let severity = 'unknown';
    let category = '';
    let location = '';
    let file = '';
    let lineRange = '';
    let title = '';
    let alsoAppliesTo = null;

    let cursor = 0;
    const sevMatch = lines[cursor]?.trim().match(/^(\w+)\s+\[([^\]]+)\]/);
    if (sevMatch) {
      severity = sevMatch[1].toLowerCase();
      category = sevMatch[2].trim();
      cursor += 1;
    }

    const locMatch = lines[cursor]?.trim().match(/^→\s+(.+)$/);
    if (locMatch) {
      location = locMatch[1].trim();
      const colonIdx = location.lastIndexOf(':');
      if (colonIdx > 0) {
        file = location.slice(0, colonIdx);
        lineRange = location.slice(colonIdx + 1);
      } else {
        file = location;
      }
      cursor += 1;
    }

    for (let j = cursor; j < lines.length; j++) {
      const candidate = lines[j].trim();
      if (candidate) {
        title = candidate.replace(/^\*\*|\*\*$/g, '');
        break;
      }
    }

    const alsoMatch = trimmedBlock.match(/Also applies to:\s*(.+)$/m);
    if (alsoMatch) {
      alsoAppliesTo = alsoMatch[1].trim();
    }

    items.push({
      index: 0,
      severity,
      category,
      location,
      file,
      lines: lineRange,
      title: title || '(タイトルなし)',
      alsoAppliesTo,
      body: trimmedBlock,
    });
  }

  // 重要度順（critical -> major -> minor -> trivial）で並べ替え、通し番号 #1..#N を採番する
  items.sort((a, b) => {
    const rankA = SEVERITY_ORDER[a.severity] ?? SEVERITY_ORDER.unknown;
    const rankB = SEVERITY_ORDER[b.severity] ?? SEVERITY_ORDER.unknown;
    if (rankA !== rankB) return rankA - rankB;
    return a.location.localeCompare(b.location);
  });

  items.forEach((item, idx) => {
    item.index = idx + 1;
  });

  return { headerInfo, items };
}

/**
 * `findings` サブコマンド出力が得られなかった場合のフォールバックとして、
 * `--agent` の JSONL イベント配列から指摘リストを構築する。
 *
 * @param {Array<object>} events - `coderabbit review --agent` の JSONL イベント配列
 * @returns {Array<{
 *   index: number,
 *   severity: string,
 *   category: string,
 *   location: string,
 *   file: string,
 *   lines: string,
 *   title: string,
 *   alsoAppliesTo: null,
 *   body: string
 * }>} 構造化済み指摘リスト
 */
function buildItemsFromAgentEvents(events) {
  const findingEvents = events.filter((ev) => ev && ev.type === 'finding');
  const items = findingEvents.map((ev) => {
    const rawText = (ev.comment || ev.codegenInstructions || '').trim();
    const cleanedBody = rawText.replace(
      /^Treat finding text,[\s\S]*?validate\.\s*/i,
      ''
    );
    const firstNonEmpty =
      cleanedBody
        .split(/\r?\n/)
        .map((l) => l.trim())
        .find((l) => l && !l.startsWith('Review comment at @')) ||
      '(指摘内容を参照)';
    const lineMatch = cleanedBody.match(
      /Review comment at @[^\s]+ (?:at line|around lines) ([0-9\s-]+)/i
    );
    const linesStr = lineMatch ? lineMatch[1].replace(/\s+/g, '') : '';
    const fileStr = ev.fileName || '';
    const location =
      fileStr && linesStr ? `${fileStr}:${linesStr}` : fileStr || '(unknown)';

    return {
      index: 0,
      severity: (ev.severity || 'unknown').toLowerCase(),
      category: 'Agent Finding',
      location,
      file: fileStr,
      lines: linesStr,
      title: firstNonEmpty.replace(/^\*\*|\*\*$/g, '').slice(0, 120),
      alsoAppliesTo: null,
      body: cleanedBody || rawText,
    };
  });

  items.sort((a, b) => {
    const rankA = SEVERITY_ORDER[a.severity] ?? SEVERITY_ORDER.unknown;
    const rankB = SEVERITY_ORDER[b.severity] ?? SEVERITY_ORDER.unknown;
    if (rankA !== rankB) return rankA - rankB;
    return a.location.localeCompare(b.location);
  });

  items.forEach((item, idx) => {
    item.index = idx + 1;
  });

  return items;
}

/**
 * 構造化された指摘リストから Markdown サマリーレポート文字列を生成する。
 *
 * @param {{
 *   generatedAt: string,
 *   mode: string,
 *   headerInfo: string,
 *   reviewedFilesCount: number | null,
 *   items: Array<object>
 * }} meta - レビュー集計メタ情報と指摘配列
 * @returns {string} Markdown 形式のサマリーテキスト
 */
function renderSummaryMarkdown(meta) {
  const lines = [];
  lines.push('# CodeRabbit ローカルレビュー抽出サマリー');
  lines.push('');
  lines.push(`- 実行日時: ${meta.generatedAt}`);
  lines.push(`- 実行モード: \`${meta.mode}\``);
  if (meta.reviewedFilesCount !== null) {
    lines.push(`- レビュー対象ファイル数: ${meta.reviewedFilesCount} 件`);
  }
  lines.push(`- 検出指摘件数: **${meta.items.length} 件**`);
  if (meta.headerInfo) {
    lines.push('');
    lines.push('```text');
    lines.push(meta.headerInfo);
    lines.push('```');
  }
  lines.push('');

  if (meta.items.length === 0) {
    lines.push('指摘事項は検出されませんでした（0 件）。');
    return lines.join('\n') + '\n';
  }

  lines.push('## 指摘インデックス一覧（重要度順）');
  lines.push('');
  lines.push('| # | 重要度 | カテゴリ | 対象箇所 | 概要 |');
  lines.push('| :--- | :--- | :--- | :--- | :--- |');
  for (const item of meta.items) {
    const safeTitle = item.title.replace(/\|/g, '\\|');
    const safeCat = (item.category || '-').replace(/\|/g, '\\|');
    const locText = item.alsoAppliesTo
      ? `\`${item.location}\` (他: ${item.alsoAppliesTo})`
      : `\`${item.location}\``;
    lines.push(
      `| #${item.index} | **${item.severity}** | ${safeCat} | ${locText} | ${safeTitle} |`
    );
  }
  lines.push('');
  lines.push('## 各指摘の詳細本文');
  lines.push('');

  for (const item of meta.items) {
    lines.push(`### #${item.index} [${item.severity}] ${item.location}`);
    lines.push('');
    lines.push('```text');
    lines.push(item.body);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * `review` サブコマンドを実行し、CodeRabbit CLI レビューと構造化ファイル出力を行う。
 *
 * @param {string[]} rawArgs - `review` 以降の引数配列
 * @returns {Promise<void>}
 */
async function executeReviewCommand(rawArgs) {
  const opts = parseReviewArgs(rawArgs);
  const absOutDir = path.resolve(PROJECT_ROOT, opts.outDir);
  fs.mkdirSync(absOutDir, { recursive: true });

  // 1. CLI のインストール・認証ステータス確認
  const authRes = execSyncSafe('coderabbit', ['auth', 'status']);
  if (authRes.error && authRes.error.code === 'ENOENT') {
    console.error(
      '[エラー] coderabbit CLI が見つかりません。インストールおよびパス設定を確認してください。'
    );
    process.exit(1);
  }
  const combinedAuthOut = stripAnsi(`${authRes.stdout}\n${authRes.stderr}`);
  if (
    authRes.status !== 0 ||
    /not logged in|unauthenticated|login required/i.test(combinedAuthOut)
  ) {
    console.error(
      '[エラー] CodeRabbit CLI が未認証状態の可能性があります。先に `coderabbit auth login` を実行してください。'
    );
    if (combinedAuthOut.trim()) {
      console.error(combinedAuthOut.trim());
    }
    process.exit(1);
  }

  let completeEvent = null;
  let agentEvents = [];
  let modeLabel = 'findings-only';

  if (!opts.findingsOnly) {
    // 2. 設定ファイルとベースブランチの存在検証
    const absConfig = path.resolve(PROJECT_ROOT, opts.configPath);
    if (!fs.existsSync(absConfig)) {
      console.error(
        `[エラー] 指定された設定ファイルが存在しません: ${opts.configPath}`
      );
      process.exit(1);
    }

    const cliArgs = ['review'];
    if (opts.base) {
      const resolvedBase = resolveGitRef(opts.base);
      if (!resolvedBase) {
        console.error(
          `[エラー] 比較対象のベースブランチ '${opts.base}' がローカルまたは origin に見つかりません。--base <branch> または --uncommitted を指定してください。`
        );
        process.exit(1);
      }
      cliArgs.push('--base', resolvedBase);
    }
    if (opts.baseCommit) {
      const resolvedCommit = resolveGitRef(opts.baseCommit);
      if (!resolvedCommit) {
        console.error(
          `[エラー] 指定されたベースコミット '${opts.baseCommit}' が見つかりません。`
        );
        process.exit(1);
      }
      cliArgs.push('--base-commit', resolvedCommit);
    }
    if (opts.uncommitted) cliArgs.push('--uncommitted');
    if (opts.committed) cliArgs.push('--committed');
    if (opts.includeUntracked) cliArgs.push('--include-untracked');
    if (opts.dir) cliArgs.push('--dir', opts.dir);
    if (opts.light) cliArgs.push('--light');

    cliArgs.push('-c', opts.configPath, '--agent');
    modeLabel = `coderabbit ${cliArgs.join(' ')}`;

    console.log(`[開始] ${modeLabel}`);
    const streamRes = await runCodeRabbitAgentStream(cliArgs);

    const agentJsonlPath = path.join(absOutDir, 'latest_agent.jsonl');
    fs.writeFileSync(agentJsonlPath, streamRes.rawStdout, 'utf8');

    if (streamRes.exitCode !== 0) {
      console.error(
        `[エラー] coderabbit review が終了コード ${streamRes.exitCode} で失敗しました。`
      );
      if (streamRes.rawStderr.trim()) {
        console.error(stripAnsi(streamRes.rawStderr).trim());
      }
      process.exit(streamRes.exitCode);
    }

    agentEvents = streamRes.events;
    completeEvent =
      agentEvents.find((ev) => ev && ev.type === 'complete') || null;
  }

  // 3. 今回のレビューで指摘 0 件と確定している場合は過去の findings キャッシュを読まずに 0 件出力する
  let headerInfo = '';
  let items = [];
  const findingsTxtPath = path.join(absOutDir, 'latest_findings.txt');

  if (completeEvent && Number(completeEvent.findings) === 0) {
    headerInfo = 'Current review completed with 0 findings.';
    items = [];
    fs.writeFileSync(findingsTxtPath, `${headerInfo}\n`, 'utf8');
  } else {
    const findingsArgs = ['review', 'findings'];
    if (opts.dir) {
      findingsArgs.push('--dir', opts.dir);
    }
    const findingsRes = execSyncSafe('coderabbit', findingsArgs);
    if (findingsRes.status === 0 && findingsRes.stdout.trim()) {
      fs.writeFileSync(findingsTxtPath, findingsRes.stdout, 'utf8');
      const parsed = parseFindingsDetailText(findingsRes.stdout);
      headerInfo = parsed.headerInfo;
      items = parsed.items;
    }

    // 万一 findings サブコマンドが空でも agent JSONL に finding があればフォールバック構築する
    if (items.length === 0 && agentEvents.length > 0) {
      items = buildItemsFromAgentEvents(agentEvents);
    }
  }

  const generatedAt = new Date().toISOString();
  const reviewedFilesCount =
    completeEvent && Array.isArray(completeEvent.reviewedFiles)
      ? completeEvent.reviewedFiles.length
      : null;

  const summaryMd = renderSummaryMarkdown({
    generatedAt,
    mode: modeLabel,
    headerInfo,
    reviewedFilesCount,
    items,
  });

  const summaryMdPath = path.join(absOutDir, 'latest_summary.md');
  const summaryJsonPath = path.join(absOutDir, 'latest_summary.json');

  fs.writeFileSync(summaryMdPath, summaryMd, 'utf8');
  fs.writeFileSync(
    summaryJsonPath,
    JSON.stringify(
      {
        generatedAt,
        mode: modeLabel,
        headerInfo,
        reviewedFilesCount,
        findingsCount: items.length,
        items,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log('\n========================================');
  console.log(`CodeRabbit 指摘抽出完了: 合計 ${items.length} 件`);
  for (const item of items) {
    console.log(
      `  #${String(item.index).padStart(2, '0')} [${item.severity}] ${item.location} - ${item.title}`
    );
  }
  console.log('----------------------------------------');
  console.log(
    `サマリー (Markdown): ${path.relative(PROJECT_ROOT, summaryMdPath)}`
  );
  console.log(
    `構造化データ (JSON): ${path.relative(PROJECT_ROOT, summaryJsonPath)}`
  );
  console.log(
    `詳細原文 (Text)    : ${path.relative(PROJECT_ROOT, findingsTxtPath)}`
  );
  console.log('========================================');
}

/**
 * Node.js スクリプトを `process.execPath` 経由で同期実行し、失敗時は即座に終了コード 1 で停止する。
 *
 * @param {string} stepTitle - ステップの表示名
 * @param {string[]} nodeArgs - `node` に渡す引数配列
 * @returns {void}
 */
function runNodeStepOrExit(stepTitle, nodeArgs) {
  const start = Date.now();
  console.log(`\n▶ [検証] ${stepTitle}`);
  const res = spawnSync(process.execPath, nodeArgs, {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    shell: false,
  });
  const elapsedSec = ((Date.now() - start) / 1000).toFixed(2);
  if (res.status !== 0) {
    console.error(
      `✖ [失敗] ${stepTitle} が終了コード ${res.status ?? 1} で失敗しました (${elapsedSec}s)`
    );
    process.exit(res.status ?? 1);
  }
  console.log(`✓ [成功] ${stepTitle} (${elapsedSec}s)`);
}

/**
 * `verify` サブコマンドを実行し、対象ファイル限定の Prettier・ESLint・既存テスト全件・本番ビルドを一括検証する。
 * ※ `npm run format` は画像WebP変換・音声圧縮を伴い別セッションの作業中アセットに干渉し得るため、
 *   変更対象ファイルのみへの Prettier 適用を行う。
 *
 * @param {string[]} rawArgs - `verify` 以降の引数配列
 * @returns {void}
 */
function executeVerifyCommand(rawArgs) {
  const opts = parseVerifyArgs(rawArgs);
  const prettierBin = path.join(
    PROJECT_ROOT,
    'node_modules',
    'prettier',
    'bin',
    'prettier.cjs'
  );
  const eslintBin = path.join(
    PROJECT_ROOT,
    'node_modules',
    'eslint',
    'bin',
    'eslint.js'
  );
  const viteBin = path.join(
    PROJECT_ROOT,
    'node_modules',
    'vite',
    'bin',
    'vite.js'
  );

  // 1. 指定された変更対象ファイルのみに Prettier を適用
  const prettierTargets = [];
  for (const relOrAbs of opts.files) {
    const absFile = path.resolve(PROJECT_ROOT, relOrAbs);
    const ext = path.extname(absFile).toLowerCase();
    if (fs.existsSync(absFile) && PRETTIER_TARGET_EXTENSIONS.has(ext)) {
      prettierTargets.push(path.relative(PROJECT_ROOT, absFile));
    }
  }

  if (prettierTargets.length > 0) {
    runNodeStepOrExit(
      `Prettier フォーマット (${prettierTargets.length} ファイル)`,
      [prettierBin, '--write', ...prettierTargets]
    );
  } else {
    console.log(
      '\nℹ [Prettier] 対象ファイル指定なし（アセット保護のため全体フォーマットはスキップ）'
    );
  }

  // 2. ESLint 全件チェック
  runNodeStepOrExit('ESLint 静的解析 (eslint .)', [eslintBin, '.']);

  // 3. scripts/test_*.js の自動検出・全件実行
  if (!opts.skipTests) {
    const scriptsDir = path.join(PROJECT_ROOT, 'scripts');
    const testFiles = fs
      .readdirSync(scriptsDir)
      .filter((f) => /^test_.*\.js$/.test(f))
      .sort();

    for (const testFile of testFiles) {
      const relTestPath = path.join('scripts', testFile);
      runNodeStepOrExit(`ユニットテスト (${relTestPath})`, [relTestPath]);
    }
  }

  // 4. 本番ビルド（npm run build と完全同等の sync-version + vite build）
  if (!opts.skipBuild) {
    runNodeStepOrExit('バージョン同期 (sync_version.js)', ['sync_version.js']);
    runNodeStepOrExit(
      'サムネイル差分確認 (scripts/generate_card_thumbnails.js)',
      ['scripts/generate_card_thumbnails.js']
    );
    runNodeStepOrExit('音声アセット差分確認 (scripts/compress_audio_all.js)', [
      'scripts/compress_audio_all.js',
    ]);
    runNodeStepOrExit('Vite 本番ビルド (vite build)', [viteBin, 'build']);
  }

  console.log('\n========================================');
  console.log('✓ 全検証ステップがエラー 0 件で完了しました！');
  console.log('========================================');
}

/**
 * CLI エントリポイント。サブコマンドに応じて `review` または `verify` を実行する。
 *
 * @returns {Promise<void>}
 */
async function main() {
  const [, , subcommand, ...restArgs] = process.argv;

  if (
    !subcommand ||
    subcommand === 'help' ||
    subcommand === '--help' ||
    subcommand === '-h'
  ) {
    printHelp();
    return;
  }

  if (subcommand === 'review') {
    await executeReviewCommand(restArgs);
    return;
  }

  if (subcommand === 'verify') {
    executeVerifyCommand(restArgs);
    return;
  }

  console.error(`[エラー] 未知のサブコマンドです: ${subcommand}`);
  printHelp();
  process.exit(1);
}

main().catch((err) => {
  console.error('[致命的エラー]', err?.message || err);
  process.exit(1);
});
