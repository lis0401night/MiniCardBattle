---
name: coderabbit-review
description: >-
  CodeRabbit CLI（.coderabbit.yaml適用）によるローカルコードレビュー実行、正本マスタと照合した対応要否の精査・一次報告、
  および承認後の安全な修正・セルフレビュー・一括検証を行うワークフロー。ユーザーが「CodeRabbitレビューをして」
  「coderabbitの結果を確認・対応して」と依頼した際や /coderabbit-review 実行時に使用する。
---

# CodeRabbit レビュー＆対応ワークフロー

仕様・コーディング規約の重複管理を防ぐため、ルール・仕様の判断基準はすべて以下の**既存正本ファイルのみ**を参照し、このスキルには実行プロセスのみを定義します。

- **ゲーム仕様の正本**: `src/utils/constants/skills.js`, `cards.js`, `characters.js`, `leaderSkills.js`
- **開発規約・レビュー基準の正本**: `.agents/AGENTS.md`, `.coderabbit.yaml`

---

## Step 1: 事前状態確認と CodeRabbit CLI レビューの実行

1. **作業ツリーの保護対象確認**
   - 実行前に `git status --short` を確認し、別セッションや手元で作業中のファイル（未コミットのアセット・マスタ変更等）を把握して非干渉の保護対象とする。
2. **比較対象の決定とレビュー実行**
   - ユーザーから比較対象の指定がない場合は、既定の `review` ブランチ比較で [coderabbit_workflow.js](../../../scripts/coderabbit_workflow.js) を実行する。
     - **既定（`review` ブランチ比較）**: `npm run review:cr`
     - **`main` ブランチ比較**: `npm run review:cr -- --base main`
     - **未コミット変更のみ**: `npm run review:cr -- --uncommitted`
     - **コミット済み変更のみ**: `npm run review:cr -- --committed --base review`
     - **直近のローカルレビュー結果の再取得のみ**: `npm run review:findings`
   - ※ `coderabbit config validate .coderabbit.yaml` は CLI 内部スキーマの既知事象（`unknown keyword: "x-undocumented"`）で非ゼロ終了する場合があるため合否判定に使用せず、`npm run review:cr` 本体の終了コードと出力で判断すること。

---

## Step 2: 正本照合による「対応要否仕分け」と一次報告（承認ゲート）

1. **抽出結果の読み込み**
   - `logs/coderabbit/latest_summary.md`（重要度順インデックス＋詳細本文）および必要に応じて `logs/coderabbit/latest_findings.txt` を読み込む。
2. **全指摘の実地裏取り（盲信禁止）**
   - すべての指摘を1件ずつ現在のソースコード、正本マスタ（`src/utils/constants/*.js`）、`.agents/AGENTS.md` / `.coderabbit.yaml`、および `git grep` による全呼び出し元調査と照合する。
   - 以下の区分へ明確に仕分けする：
     - **対応推奨（高 / 中 / 低）**: 実在するバグ・仕様不整合・データ保護漏れ・規約違反（実戦ロジックと AI / エンジンの対称性も横断確認する）。
     - **対応不要（誤検知・仕様維持）**: 正本仕様と矛盾する提案や意図された防御処理。`.agents/AGENTS.md` / `.coderabbit.yaml` の表現不足が原因で誤検知された場合は「コード維持・規約記述の明確化」とする。
3. **ユーザーへの一次報告と承認待ち**
   - ユーザーから「最初から修正まで一気に進めてほしい」と明示されていない限り、**コードを変更する前に**対応要否の判断一覧レポートを提示し、ユーザーの承認を得てから Step 3 へ進む。

---

## Step 3: 安全な修正実装と全差分セルフレビュー監査

1. **修正の実装**
   - `.agents/AGENTS.md` および `.coderabbit.yaml` の規約に従い、最小限の変更で実装する。Step 1 で把握した別セッションの作業中ファイルには一切触れないこと。
2. **全変更 diff のセルフレビュー監査**
   - 本タスクで編集した全ファイルの `git diff -- <編集ファイル一覧>` を出力して全行精読し、構文残骸・プロパティ欠落・副作用・エッジケース漏れがないか自己監査する。

---

## Step 4: 一括検証パイプラインの実行と完了報告

1. **一括検証コマンドの実行**
   - 本タスクで変更したファイルのみを引数に渡して検証スクリプトを実行する（※画像変換・音声圧縮を含む `npm run format` は別セッションのアセットに干渉するため使用しない）：
     ```powershell
     npm run review:verify -- <編集したファイル1> <編集したファイル2> ...
     ```
2. **完了報告**
   - 上記検証コマンドがエラー 0 件（exit code 0）で完了したことを実際に確認した上で、変更ファイル（`file://` リンク付き）・対応内容・見送った項目・検証結果を日本語で簡潔に報告する。
