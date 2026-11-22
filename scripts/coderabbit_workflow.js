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
 * Windows の `.cmd` / `.bat` ラッパーファイルから Node.js 実行エントリ（`.js`/`.cjs`/`.mjs`）を解決する。
 * シェル経由（`shell: true`）を使わずに `process.execPath` で直接起動するために使用する。
 *
 * @param {string} cmdPath - `.cmd` または `.bat` ラッパーの絶対パス
 * @returns {string | null} 解決できた Node.js エントリスクリプトの絶対パス（特定できない場合は null）
 */
function resolveNodeEntryFromWindowsCmd(cmdPath) {
  try {
    const content = fs.readFileSync(cmdPath, 'utf8');
    const cmdDir = path.dirname(cmdPath);
    // npm / pnpm / yarn 等の標準的な Windows .cmd シムに含まれる "%dp0%\...\*.js" 形式（引用付き空白パス／無引用の双方）を抽出
    const match = content.match(
      /"(?:%~?dp0\\?|%dp0%\\?)([^"\r\n]+?\.(?:c?js|mjs))"|(?:%~?dp0\\?|%dp0%\\?)([^\s"\r\n]+?\.(?:c?js|mjs))/i
    );
    const rawRelScript = match ? match[1] || match[2] : null;
    if (!rawRelScript) return null;
    const relScript = rawRelScript.replace(/\\/g, path.sep);
    const absScript = path.resolve(cmdDir, relScript);
    if (fs.existsSync(absScript) && fs.statSync(absScript).isFile()) {
      return absScript;
    }
  } catch {
    // 読み込み不可時は未解決として扱う
  }
  return null;
}

/**
 * Windows 環境で `PATH` / `PATHEXT` から実体バイナリ（`.exe`/`.com`）または
 * `.cmd` ラッパーの Node.js エントリを解決し、`shell: false` で安全に実行できる起動情報を返す。
 *
 * @param {string} command - 実行コマンド名またはバイナリパス
 * @param {string[]} args - 元の引数配列
 * @returns {{ file: string, args: string[] } | null} `shell: false` で起動可能な実行情報（解決不可時は null）
 */
function resolveWindowsDirectExecution(command, args) {
  if (process.platform !== 'win32') return null;

  const hasPathSep = command.includes('\\') || command.includes('/');
  const hasExt = Boolean(path.extname(command));
  const rawPathExt = (process.env.PATHEXT || '.EXE;.COM;.CMD;.BAT')
    .split(';')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  // 同一ディレクトリ内では直接実行可能な .exe / .com を優先し、その後に .cmd / .bat を探索する
  const preferredExts = [
    ...rawPathExt.filter((e) => e === '.exe' || e === '.com'),
    ...rawPathExt.filter((e) => e !== '.exe' && e !== '.com'),
  ];

  const searchDirs = hasPathSep
    ? [path.dirname(path.resolve(PROJECT_ROOT, command))]
    : (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  const baseName = hasPathSep ? path.basename(command) : command;

  for (const dir of searchDirs) {
    const candidateNames = hasExt
      ? [baseName]
      : preferredExts.map((ext) => `${baseName}${ext}`);

    for (const candName of candidateNames) {
      const fullPath = path.join(dir, candName);
      try {
        if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
          continue;
        }
      } catch {
        continue;
      }
      const ext = path.extname(fullPath).toLowerCase();
      if (ext === '.exe' || ext === '.com') {
        return { file: fullPath, args };
      }
      if (ext === '.cmd' || ext === '.bat') {
        const nodeEntry = resolveNodeEntryFromWindowsCmd(fullPath);
        if (nodeEntry) {
          return { file: process.execPath, args: [nodeEntry, ...args] };
        }
      }
    }
  }

  return null;
}

/**
 * 外部コマンドを同期実行し、終了コード・標準出力・標準エラー出力を返す。
 * Windows 環境で `ENOENT` / `EINVAL` となった場合もシェル（`shell: true`）に頼らず、
 * 実行ファイルまたは `.cmd` の Node エントリを解決して引数配列を維持したまま安全に再試行する。
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
    (res.error.code === 'EINVAL' || res.error.code === 'ENOENT')
  ) {
    const resolved = resolveWindowsDirectExecution(command, args);
    if (resolved) {
      res = spawnSync(resolved.file, resolved.args, {
        cwd,
        stdio,
        encoding: 'utf8',
        shell: false,
      });
    }
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
    let retriedResolved = false;
    let activeAttemptId = 0;
    let settled = false;

    /**
     * 子プロセスを `shell: false` で起動してストリーム監視を開始する内部ヘルパー。
     * 再試行時は試行世代（activeAttemptId）を進め、古い子プロセスから届く後続イベントを完全に無視する。
     *
     * @param {string} execFile - 実行するコマンドまたはバイナリ絶対パス
     * @param {string[]} execArgs - 実行引数配列
     * @returns {void}
     */
    const launch = (execFile, execArgs) => {
      const attemptId = ++activeAttemptId;
      const child = spawn(execFile, execArgs, {
        cwd: PROJECT_ROOT,
        shell: false,
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
        if (settled || attemptId !== activeAttemptId) return;
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
        if (settled || attemptId !== activeAttemptId) return;
        rawStderr += chunk;
      });

      child.on('error', (err) => {
        if (settled || attemptId !== activeAttemptId) return;
        if (
          !retriedResolved &&
          process.platform === 'win32' &&
          (err.code === 'EINVAL' || err.code === 'ENOENT')
        ) {
          retriedResolved = true;
          const resolved = resolveWindowsDirectExecution('coderabbit', cliArgs);
          if (resolved) {
            // 先に新世代の起動へ切り替えることで、失敗した最初の子プロセスの close イベントを無効化する
            launch(resolved.file, resolved.args);
            return;
          }
        }
        settled = true;
        reject(err);
      });

      child.on('close', (code) => {
        if (settled || attemptId !== activeAttemptId) return;
        settled = true;
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

    launch('coderabbit', cliArgs);
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
 * 本文中に含まれる最長バッククォート列より長いフェンスを動的生成し、
 * コードブロックを含むテキストでも Markdown 構造が崩れない安全なコードブロック行配列を返す。
 *
 * @param {string} content - コードブロック内に埋め込むテキスト
 * @param {string} [lang='text'] - フェンス言語指定子
 * @returns {string[]} 開始フェンス・本文・終了フェンスの3要素配列
 */
function buildSafeCodeBlockLines(content, lang = 'text') {
  const text = String(content ?? '');
  const backtickRuns = text.match(/`+/g);
  const maxRun = backtickRuns
    ? backtickRuns.reduce((max, run) => Math.max(max, run.length), 0)
    : 0;
  const fence = '`'.repeat(Math.max(3, maxRun + 1));
  return [`${fence}${lang}`, text, fence];
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
    lines.push(...buildSafeCodeBlockLines(meta.headerInfo, 'text'));
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
    lines.push(...buildSafeCodeBlockLines(item.body, 'text'));
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * `coderabbit review findings` のヘッダー情報から `Base branch:` の値を抽出する。
 *
 * @param {string} headerInfo - findings 出力のヘッダー文字列
 * @returns {string | null} 抽出できたベースブランチ名（記載なしの場合は null）
 */
function extractHeaderBaseBranch(headerInfo) {
  if (!headerInfo) return null;
  const match = headerInfo.match(/^Base branch:\s*(.+)$/im);
  return match && match[1] ? match[1].trim() : null;
}

/**
 * Git ベースブランチ名から `origin/` プレフィックスを取り除き比較用に正規化する。
 *
 * @param {string | null | undefined} refName - ブランチ名またはリモート参照名
 * @returns {string | null} 正規化されたブランチ名
 */
function normalizeBranchRefForCompare(refName) {
  if (!refName || typeof refName !== 'string') return null;
  return refName.trim().replace(/^origin\//, '');
}

/**
 * レビュー実行時の対象スコープ情報を構築する。
 *
 * @param {object} opts - `parseReviewArgs` の解析済みオプション
 * @param {string | null} resolvedBase - 解決済みベースブランチ名
 * @param {string | null} resolvedBaseCommit - 解決済みベースコミットハッシュ
 * @returns {{
 *   base: string | null,
 *   baseCommit: string | null,
 *   uncommitted: boolean,
 *   committed: boolean,
 *   includeUntracked: boolean,
 *   dir: string | null
 * }} スコープ情報オブジェクト
 */
function buildReviewScope(opts, resolvedBase, resolvedBaseCommit) {
  return {
    base: resolvedBase || opts.base || null,
    baseCommit: resolvedBaseCommit || opts.baseCommit || null,
    uncommitted: Boolean(opts.uncommitted),
    committed: Boolean(opts.committed),
    includeUntracked: Boolean(opts.includeUntracked),
    dir: opts.dir ? path.resolve(PROJECT_ROOT, opts.dir) : null,
  };
}

/**
 * 保存済みの `latest_summary.json` を読み込んで返す。
 * ファイルが存在しない場合や JSON 破損時は null を返す。
 *
 * @param {string} summaryJsonPath - `latest_summary.json` の絶対パス
 * @returns {object | null} パース済みのレポートオブジェクト
 */
function loadSavedSummaryReport(summaryJsonPath) {
  try {
    if (!fs.existsSync(summaryJsonPath)) return null;
    const raw = fs.readFileSync(summaryJsonPath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * `--findings-only` 実行時に、保存済みの直近完了レポート（0件完了）が
 * 今回の指定対象スコープと一致するかを判定する。
 *
 * @param {object | null} savedReport - 保存済み `latest_summary.json` の内容
 * @param {object} opts - `parseReviewArgs` の解析済みオプション
 * @returns {boolean} 0件完了の保存済みレポートをそのまま維持すべきであれば true
 */
function shouldKeepSavedZeroFindingReport(savedReport, opts) {
  if (
    !savedReport ||
    savedReport.status !== 'completed' ||
    Number(savedReport.findingsCount) !== 0
  ) {
    return false;
  }
  const savedScope = savedReport.scope || {};
  const requestedDir = opts.dir ? path.resolve(PROJECT_ROOT, opts.dir) : null;

  // レビュー対象ディレクトリ（全体=null か特定ディレクトリか）が一致することを必須とする
  if ((savedScope.dir || null) !== requestedDir) {
    return false;
  }
  // --base / --base-commit / --uncommitted / --committed が明示指定された場合も一致を確認する
  if (
    opts.baseExplicit &&
    normalizeBranchRefForCompare(savedScope.base) !==
      normalizeBranchRefForCompare(opts.base)
  ) {
    return false;
  }
  if (opts.baseCommit && savedScope.baseCommit !== opts.baseCommit) {
    return false;
  }
  if (opts.uncommitted && !savedScope.uncommitted) {
    return false;
  }
  if (opts.committed && !savedScope.committed) {
    return false;
  }
  return true;
}

/**
 * 指摘サマリーを標準出力へ整形表示する。
 *
 * @param {Array<object>} items - 構造化された指摘配列
 * @param {string} summaryMdPath - Markdown サマリーの絶対パス
 * @param {string} summaryJsonPath - JSON サマリーの絶対パス
 * @param {string} findingsTxtPath - 原文テキストの絶対パス
 * @returns {void}
 */
function printReviewSummaryConsole(
  items,
  summaryMdPath,
  summaryJsonPath,
  findingsTxtPath
) {
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

  const summaryMdPath = path.join(absOutDir, 'latest_summary.md');
  const summaryJsonPath = path.join(absOutDir, 'latest_summary.json');
  const findingsTxtPath = path.join(absOutDir, 'latest_findings.txt');

  // --findings-only 実行時、同一対象スコープの直近レビューが 0 件完了だった場合は
  // `coderabbit review findings` の仕様（直近の「指摘あり」レビューを返す）による過去指摘の上書きを防ぎ 0 件を維持する
  if (opts.findingsOnly) {
    const savedReport = loadSavedSummaryReport(summaryJsonPath);
    if (shouldKeepSavedZeroFindingReport(savedReport, opts)) {
      console.log(
        '[情報] 直近の完了済みレビューは指摘 0 件です。保存済みレポートを維持します。'
      );
      printReviewSummaryConsole(
        [],
        summaryMdPath,
        summaryJsonPath,
        findingsTxtPath
      );
      return;
    }
  }

  let completeEvent = null;
  let agentEvents = [];
  let modeLabel = 'findings-only';
  let resolvedBase = null;
  let resolvedBaseCommit = null;

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
      resolvedBase = resolveGitRef(opts.base);
      if (!resolvedBase) {
        console.error(
          `[エラー] 比較対象のベースブランチ '${opts.base}' がローカルまたは origin に見つかりません。--base <branch> または --uncommitted を指定してください。`
        );
        process.exit(1);
      }
      cliArgs.push('--base', resolvedBase);
    }
    if (opts.baseCommit) {
      resolvedBaseCommit = resolveGitRef(opts.baseCommit);
      if (!resolvedBaseCommit) {
        console.error(
          `[エラー] 指定されたベースコミット '${opts.baseCommit}' が見つかりません。`
        );
        process.exit(1);
      }
      cliArgs.push('--base-commit', resolvedBaseCommit);
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
  let findingsTextToWrite = null;

  if (completeEvent && Number(completeEvent.findings) === 0) {
    headerInfo = 'Current review completed with 0 findings.';
    items = [];
    findingsTextToWrite = `${headerInfo}\n`;
  } else {
    // ※ CodeRabbit CLI (v0.7.5) の `review findings` は `--dir` のみ対応（`--base` 非対応）
    const findingsArgs = ['review', 'findings'];
    if (opts.dir) {
      findingsArgs.push('--dir', opts.dir);
    }
    const findingsRes = execSyncSafe('coderabbit', findingsArgs);
    const hasUsableAgentFallback =
      !opts.findingsOnly &&
      (completeEvent !== null ||
        agentEvents.some((ev) => ev && ev.type === 'finding'));

    if (
      findingsRes.error ||
      findingsRes.status !== 0 ||
      !findingsRes.stdout.trim()
    ) {
      const detailText = stripAnsi(
        `${findingsRes.stderr}\n${findingsRes.stdout}`
      ).trim();
      if (hasUsableAgentFallback) {
        console.warn(
          `[警告] coderabbit review findings の取得に失敗したため（終了コード: ${findingsRes.status}）、今回の JSONL イベントからフォールバック構築します。`
        );
        if (detailText) console.warn(detailText);
        items = buildItemsFromAgentEvents(agentEvents);
        headerInfo =
          'Fallback: constructed from current review JSONL events (coderabbit review findings failed).';
        findingsTextToWrite = `${headerInfo}\n`;
      } else {
        // フォールバック可能な今回の JSONL がない場合は既存レポートを上書きせずエラー終了する
        console.error(
          `[エラー] coderabbit review findings の取得に失敗しました（終了コード: ${findingsRes.status}）。既存の成功レポートは保持されます。`
        );
        if (findingsRes.error && findingsRes.error.message) {
          console.error(findingsRes.error.message);
        }
        if (detailText) {
          console.error(detailText);
        }
        process.exit(findingsRes.status !== 0 ? findingsRes.status : 1);
      }
    } else {
      const parsed = parseFindingsDetailText(findingsRes.stdout);
      const headerBase = extractHeaderBaseBranch(parsed.headerInfo);
      // CLI の `review findings` が別ベースの過去キャッシュを返した場合は、今回実行した JSONL 結果で上書き防御する
      const hasBaseMismatch =
        !opts.findingsOnly &&
        Boolean(resolvedBase) &&
        Boolean(headerBase) &&
        normalizeBranchRefForCompare(headerBase) !==
          normalizeBranchRefForCompare(resolvedBase);

      if (hasBaseMismatch && hasUsableAgentFallback) {
        console.warn(
          `[警告] review findings のベースブランチ（${headerBase}）が今回の指定ベース（${resolvedBase}）と不一致のため、今回の JSONL イベントから構築します。`
        );
        items = buildItemsFromAgentEvents(agentEvents);
        headerInfo = `Base branch mismatch avoided (expected: ${resolvedBase}, findings cache: ${headerBase}). Constructed from current review JSONL events.`;
        findingsTextToWrite = `${headerInfo}\n`;
      } else {
        findingsTextToWrite = findingsRes.stdout;
        headerInfo = parsed.headerInfo;
        items = parsed.items;
        // 万一 findings サブコマンドのパース結果が空でも今回の agent JSONL に finding があればフォールバック構築する
        if (
          items.length === 0 &&
          agentEvents.some((ev) => ev && ev.type === 'finding')
        ) {
          items = buildItemsFromAgentEvents(agentEvents);
        }
      }
    }
  }

  if (findingsTextToWrite !== null) {
    fs.writeFileSync(findingsTxtPath, findingsTextToWrite, 'utf8');
  }

  const generatedAt = new Date().toISOString();
  const reviewedFilesCount =
    completeEvent && Array.isArray(completeEvent.reviewedFiles)
      ? completeEvent.reviewedFiles.length
      : null;
  const scope = buildReviewScope(
    opts,
    resolvedBase ||
      (opts.findingsOnly ? extractHeaderBaseBranch(headerInfo) : null),
    resolvedBaseCommit
  );

  const summaryMd = renderSummaryMarkdown({
    generatedAt,
    mode: modeLabel,
    headerInfo,
    reviewedFilesCount,
    items,
  });

  fs.writeFileSync(summaryMdPath, summaryMd, 'utf8');
  fs.writeFileSync(
    summaryJsonPath,
    JSON.stringify(
      {
        status: 'completed',
        generatedAt,
        mode: modeLabel,
        scope,
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

  printReviewSummaryConsole(
    items,
    summaryMdPath,
    summaryJsonPath,
    findingsTxtPath
  );
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

  // 1. 指定された変更対象ファイルのみに Prettier を適用（ディレクトリの再帰書き換えを厳格に拒否）
  const prettierTargets = [];
  for (const relOrAbs of opts.files) {
    const absFile = path.resolve(PROJECT_ROOT, relOrAbs);
    if (!fs.existsSync(absFile)) {
      console.warn(
        `[警告] 指定されたファイルが存在しないためスキップします: ${relOrAbs}`
      );
      continue;
    }
    const stat = fs.statSync(absFile);
    if (stat.isDirectory()) {
      console.error(
        `[エラー] Prettier 対象にディレクトリは指定できません（未対象ファイルの再帰書き換え防止）: ${relOrAbs}`
      );
      process.exit(1);
    }
    const ext = path.extname(absFile).toLowerCase();
    if (stat.isFile() && PRETTIER_TARGET_EXTENSIONS.has(ext)) {
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
