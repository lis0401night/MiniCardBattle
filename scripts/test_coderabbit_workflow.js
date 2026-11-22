/**
 * scripts/test_coderabbit_workflow.js
 * CodeRabbit ワークフロー補助スクリプト（scripts/coderabbit_workflow.js）のユニットテスト
 *
 * 検証項目:
 * 1. Windows .cmd シムの `%dp0%` 形式および `%~dp0` 形式の双方で同一の Node.js エントリを解決できること
 * 2. 0 件完了レポートのベースラインハッシュ照合（CLI 履歴変化なし時は維持、CLI 直接実行で新規指摘が出た場合は最新取得）
 * 3. `--saved-only` による保存済みレポート再表示、および失敗時に既存の成功レポート・ログを上書きしないこと
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeFindingsDigest,
  resolveNodeEntryFromWindowsCmd,
  shouldKeepSavedZeroFindingReport,
} from './coderabbit_workflow.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const WORKFLOW_SCRIPT = path.join(
  PROJECT_ROOT,
  'scripts',
  'coderabbit_workflow.js'
);

let passedCount = 0;
let failedCount = 0;

/**
 * 単一テストケースを実行して成否を記録するヘルパー。
 *
 * @param {string} name - テストケース名
 * @param {() => void} fn - テスト処理本体
 * @returns {void}
 */
function testCase(name, fn) {
  try {
    fn();
    passedCount += 1;
    console.log(`  PASS: ${name}`);
  } catch (err) {
    failedCount += 1;
    console.error(`  FAIL: ${name}`);
    console.error(`    ${err?.message || err}`);
  }
}

console.log('=== CodeRabbit ワークフロー補助スクリプト ユニットテスト ===');

const tmpBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcb-cr-workflow-'));

try {
  // ---------------------------------------------------
  // 1. Windows .cmd シムの %dp0% / %~dp0 解決テスト
  // ---------------------------------------------------
  const normalEntry = path.join(
    tmpBaseDir,
    'node_modules',
    'demo-cli',
    'bin',
    'cli.js'
  );
  const spacedEntry = path.join(tmpBaseDir, 'my tools', 'demo cli.cjs');
  const mjsEntry = path.join(tmpBaseDir, 'esm-cli', 'index.mjs');

  fs.mkdirSync(path.dirname(normalEntry), { recursive: true });
  fs.mkdirSync(path.dirname(spacedEntry), { recursive: true });
  fs.mkdirSync(path.dirname(mjsEntry), { recursive: true });
  fs.writeFileSync(normalEntry, '// normal cli\n', 'utf8');
  fs.writeFileSync(spacedEntry, '// spaced cli\n', 'utf8');
  fs.writeFileSync(mjsEntry, '// mjs cli\n', 'utf8');

  testCase(
    'Windows .cmd シム: npm 生成の %dp0% 形式と %~dp0 形式で同一の Node エントリを解決できること',
    () => {
      const cmdDp0 = path.join(tmpBaseDir, 'demo_dp0.cmd');
      const cmdTilde = path.join(tmpBaseDir, 'demo_tilde.cmd');

      fs.writeFileSync(
        cmdDp0,
        [
          '@ECHO off',
          'SETLOCAL',
          'SET "dp0=%~dp0"',
          '"%_prog%"  "%dp0%\\node_modules\\demo-cli\\bin\\cli.js" %*',
        ].join('\r\n'),
        'utf8'
      );
      fs.writeFileSync(
        cmdTilde,
        [
          '@ECHO off',
          'node "%~dp0\\node_modules\\demo-cli\\bin\\cli.js" %*',
        ].join('\r\n'),
        'utf8'
      );

      const resolvedDp0 = resolveNodeEntryFromWindowsCmd(cmdDp0);
      const resolvedTilde = resolveNodeEntryFromWindowsCmd(cmdTilde);

      assert.equal(resolvedDp0, normalEntry);
      assert.equal(resolvedTilde, normalEntry);
      assert.equal(resolvedDp0, resolvedTilde);
    }
  );

  testCase(
    'Windows .cmd シム: 空白を含むパスでも %dp0% / %~dp0 の双方で同一エントリを解決できること',
    () => {
      const cmdSpacedDp0 = path.join(tmpBaseDir, 'spaced_dp0.cmd');
      const cmdSpacedTilde = path.join(tmpBaseDir, 'spaced_tilde.cmd');

      fs.writeFileSync(
        cmdSpacedDp0,
        '"%_prog%" "%dp0%\\my tools\\demo cli.cjs" %*\r\n',
        'utf8'
      );
      fs.writeFileSync(
        cmdSpacedTilde,
        'node "%~dp0\\my tools\\demo cli.cjs" %*\r\n',
        'utf8'
      );

      assert.equal(resolveNodeEntryFromWindowsCmd(cmdSpacedDp0), spacedEntry);
      assert.equal(resolveNodeEntryFromWindowsCmd(cmdSpacedTilde), spacedEntry);
    }
  );

  testCase(
    'Windows .cmd シム: 引用なし形式（%dp0% / %~dp0）および実体不在時の null 返却を正しく扱うこと',
    () => {
      const cmdUnquotedDp0 = path.join(tmpBaseDir, 'unquoted_dp0.cmd');
      const cmdUnquotedTilde = path.join(tmpBaseDir, 'unquoted_tilde.cmd');
      const cmdMissing = path.join(tmpBaseDir, 'missing.cmd');

      fs.writeFileSync(
        cmdUnquotedDp0,
        'node %dp0%\\esm-cli\\index.mjs %*\r\n',
        'utf8'
      );
      fs.writeFileSync(
        cmdUnquotedTilde,
        'node %~dp0\\esm-cli\\index.mjs %*\r\n',
        'utf8'
      );
      fs.writeFileSync(
        cmdMissing,
        '"%_prog%" "%dp0%\\not_found\\cli.js" %*\r\n',
        'utf8'
      );

      assert.equal(resolveNodeEntryFromWindowsCmd(cmdUnquotedDp0), mjsEntry);
      assert.equal(resolveNodeEntryFromWindowsCmd(cmdUnquotedTilde), mjsEntry);
      assert.equal(resolveNodeEntryFromWindowsCmd(cmdMissing), null);
    }
  );

  // ---------------------------------------------------
  // 2. 0件レポート照合（baselineFindingsHash）の検証
  // ---------------------------------------------------
  testCase(
    'shouldKeepSavedZeroFindingReport: CLI 履歴ハッシュ一致時は 0 件維持、新規指摘でハッシュ変化時は最新採用すること',
    () => {
      const oldCliFindings =
        'Most recent local review with findings: 2 stored findings\nBase branch: review\n';
      const newCliFindings =
        'Most recent local review with findings: 1 stored findings\nBase branch: review\nNew finding body\n';

      const oldHash = computeFindingsDigest(oldCliFindings);
      const newHash = computeFindingsDigest(newCliFindings);
      assert.ok(oldHash && newHash && oldHash !== newHash);

      const savedZeroReport = {
        status: 'completed',
        findingsCount: 0,
        baselineFindingsHash: oldHash,
        scope: {
          base: 'review',
          baseCommit: null,
          uncommitted: false,
          committed: false,
          includeUntracked: false,
          dir: null,
        },
      };
      const defaultOpts = {
        base: 'review',
        baseExplicit: false,
        baseCommit: null,
        uncommitted: false,
        committed: false,
        dir: null,
      };

      // CLI 履歴が変わっていなければ 0 件を維持
      assert.equal(
        shouldKeepSavedZeroFindingReport(savedZeroReport, defaultOpts, oldHash),
        true
      );
      // CLI を直接実行して新たな指摘が出た場合は古い 0 件を返さない
      assert.equal(
        shouldKeepSavedZeroFindingReport(savedZeroReport, defaultOpts, newHash),
        false
      );
      // baselineFindingsHash がない旧レポートは照合不能のため再利用しない
      const legacyZeroReport = { ...savedZeroReport };
      delete legacyZeroReport.baselineFindingsHash;
      assert.equal(
        shouldKeepSavedZeroFindingReport(
          legacyZeroReport,
          defaultOpts,
          oldHash
        ),
        false
      );
      // 0 件保存時も今回も CLI に指摘キャッシュがなければ 0 件を維持
      const noBaselineReport = {
        ...savedZeroReport,
        baselineFindingsHash: null,
      };
      assert.equal(
        shouldKeepSavedZeroFindingReport(noBaselineReport, defaultOpts, null),
        true
      );
      // --dir 不一致時は再利用しない
      assert.equal(
        shouldKeepSavedZeroFindingReport(
          savedZeroReport,
          { ...defaultOpts, dir: 'src' },
          oldHash
        ),
        false
      );
    }
  );

  // ---------------------------------------------------
  // 3. --saved-only 動作と失敗時の成功ログ保護テスト
  // ---------------------------------------------------
  testCase(
    '--saved-only は CLI を呼ばずに保存済みレポートを再表示し、失敗時は既存 latest_agent.jsonl を保護すること',
    () => {
      const outDir = path.join(tmpBaseDir, 'out');
      fs.mkdirSync(outDir, { recursive: true });

      const savedSummaryJson = path.join(outDir, 'latest_summary.json');
      const savedAgentLog = path.join(outDir, 'latest_agent.jsonl');
      const originalLogBody = '{"type":"complete","findings":0}\n';

      fs.writeFileSync(
        savedSummaryJson,
        JSON.stringify(
          {
            status: 'completed',
            generatedAt: '2026-11-22T14:40:00.000Z',
            mode: 'coderabbit review --base review -c .coderabbit.yaml --agent',
            findingsCount: 0,
            items: [],
          },
          null,
          2
        ),
        'utf8'
      );
      fs.writeFileSync(savedAgentLog, originalLogBody, 'utf8');

      // --saved-only は正常終了して 0 件を再表示する
      const savedRes = spawnSync(
        process.execPath,
        [WORKFLOW_SCRIPT, 'review', '--saved-only', '--out-dir', outDir],
        { cwd: PROJECT_ROOT, encoding: 'utf8' }
      );
      assert.equal(
        savedRes.status,
        0,
        `--saved-only が成功すること: ${savedRes.stderr}`
      );
      assert.match(savedRes.stdout, /合計 0 件/);

      // 存在しない設定ファイルで review が早期失敗しても、既存の latest_agent.jsonl は上書きされない
      const failRes = spawnSync(
        process.execPath,
        [
          WORKFLOW_SCRIPT,
          'review',
          '--config',
          '__non_existent_coderabbit_config__.yaml',
          '--out-dir',
          outDir,
        ],
        { cwd: PROJECT_ROOT, encoding: 'utf8' }
      );
      assert.notEqual(failRes.status, 0);
      assert.equal(fs.readFileSync(savedAgentLog, 'utf8'), originalLogBody);
    }
  );
} finally {
  fs.rmSync(tmpBaseDir, { recursive: true, force: true });
}

console.log(`\n結果: ${passedCount} passed, ${failedCount} failed`);
if (failedCount > 0) {
  process.exit(1);
}
console.log('ALL CODERABBIT WORKFLOW TESTS PASSED!');
