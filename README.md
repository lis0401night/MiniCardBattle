# MiniCardBattle

Vanilla JS で構築されたミニカードバトルゲームをベースに、UI部分を React (Vite経由) で管理するように再構築されたプロジェクトです。

## 前提条件

このプロジェクトを実行およびビルドするには、以下のツールがインストールされている必要があります。

- Node.js (v18 以降推奨)
- npm (Node.js と共にインストールされます)

## ローカル開発環境のセットアップと起動手順

開発時にローカルサーバーを起動し、HMR（Hot Module Replacement）機能を利用しながら開発を進めるための手順です。

1. **パッケージのインストール**
   プロジェクトのルートディレクトリで以下のコマンドを実行し、必要な依存パッケージをインストールします。

   ```bash
   npm install
   ```

2. **開発用サーバーの起動**
   以下のコマンドで、Viteの開発用サーバーを起動します。

   ```bash
   npm run dev
   ```

   起動後、ターミナルに表示されるローカルURL（通常は `http://localhost:5173/` など）にブラウザでアクセスすると、ゲームをプレイおよび確認できます。ソースコード（`src/` 配下のコンポーネントなど）を編集すると即座に画面に反映されます。

## コードの自動整形・静的解析 (Lint & Format)

開発中のコードの品質やフォーマットを統一するために、以下のコマンドを利用できます。

1. **コードの自動整形と不要なインポートの削除**

   ```bash
   npm run format
   ```

   プロジェクト全体のコードに対して、Prettierによる自動整形と、ESLintによる自動修正（未使用のインポートや変数の自動削除など）を一括で行います。

2. **静的解析のみの実行**
   ```bash
   npm run lint
   ```
   ESLintによるコードチェックのみを行います。エラーや警告を確認したい場合に使用します。

## CodeRabbit CLI によるコードレビューと検証ワークフロー

`.coderabbit.yaml` のプロジェクトルールを用いたローカルコードレビューの実行、指摘事項の抽出、および修正後の一括検証を行うための仕組み（`scripts/coderabbit_workflow.js` および `.agents/skills/coderabbit-review/`）が用意されています。

### 1. 事前準備

CodeRabbit CLI がインストールされ、認証済みである必要があります。

```bash
# 認証状態の確認
coderabbit auth status

# 未ログインの場合はログインを実行
coderabbit auth login
```

### 2. Antigravity（AI エージェント）からの実行方法

チャット欄からワークスペーススキル `/coderabbit-review` を呼び出すと、「CLIレビュー実行 ➔ 正本マスタ（`src/utils/constants/`）と照合した対応要否の一次報告（承認ゲート） ➔ 承認後の修正・差分セルフレビュー ➔ 一括検証」までを順を追って実行します。

- **既定（`review` ブランチとの比較）**: `/coderabbit-review`（または「CodeRabbitレビューをして」）
- **`main` ブランチとの比較**: 「`main` と比較して `/coderabbit-review` を実行して」
- **未コミット変更のみを対象**: 「未コミット分だけ `/coderabbit-review` をして」

### 3. ターミナルからの直接実行方法

1. **レビューの実行と指摘サマリーの出力**

   ```bash
   # 既定（review ブランチとの差分をレビュー）
   npm run review:cr

   # main ブランチとの差分をレビュー
   npm run review:cr -- --base main

   # ステージ済み・未コミットの追跡変更のみをレビュー
   npm run review:cr -- --uncommitted

   # コミット済み変更のみをレビュー
   npm run review:cr -- --committed --base review

   # 新規レビューを実行せず、直近のローカルレビュー結果のみを再整形して出力
   npm run review:findings
   ```

   実行すると、Git 管理外の `logs/coderabbit/` ディレクトリに以下のファイルが出力されます（全オプションは `node scripts/coderabbit_workflow.js --help` で確認できます）。
   - `logs/coderabbit/latest_summary.md`: 重要度順の指摘一覧テーブルおよび詳細本文
   - `logs/coderabbit/latest_summary.json`: 構造化された指摘データ（JSON）
   - `logs/coderabbit/latest_findings.txt`: `coderabbit review findings` の詳細原文

2. **修正後の一括検証（Prettier + ESLint + ユニットテスト全件 + 本番ビルド）**

   画像WebP変換や音声圧縮を伴う `npm run format` で別作業中のアセットに干渉しないよう、**指定した変更ファイルのみに Prettier** を適用した上で、ESLint・既存テスト（`scripts/test_*.js`）・本番ビルドを一括検証します。

   ```bash
   npm run review:verify -- src/game/ai_normal.js src/styles/style.css
   ```

## 本番環境用ビルド手順

本番環境のサーバー等にデプロイするために、ファイルを最適化して出力する手順です。

1. **ビルドコマンドの実行**

   ```bash
   npm run build
   ```

2. **成果物の確認**
   コマンドが成功すると、プロジェクトルートに `dist/` フォルダが生成されます。
   `dist/` フォルダの中には最適化された `index.html` や `assets/` などが含まれています。

3. **デプロイ**
   作成された `dist/` フォルダの**内容すべて**を、本番環境のWebサーバー（Apache, Nginx, または Xserverなどのレンタルサーバー）の公開ディレクトリにアップロードしてください。

   ※ ビルド後の動作確認を行う場合は、以下のコマンドで簡易的なプレビュー用サーバーを立てることができます。

   ```bash
   npm run preview
   ```

## アーキテクチャについての注記

- トップ画面やデッキ構築はもちろんのこと、**バトル画面（描画から進行アニメーションまで）も含めたすべてのUI表示は React コンポーネントおよび専用の状態管理オブジェクト（`GameState`）によって統合的に管理されています。**
- 以前はレガシーな DOM 直接操作による描画（ハイブリッド構成）を行っていましたが、現在は「DOM処理は廃止し、Reactの状態管理に極力任せる」という原則のもと、完全にリファクタリングが完了しています（`src/pages/BattleScreen.jsx`, `src/components/battle/Board.jsx` 等）。

## サービスワーカー（PWA・キャッシュ）と自動アップデートに関する仕様

このプロジェクトでは、オフライン対応およびパフォーマンス向上のためサービスワーカー（PWA）によるキャッシュを利用しています。
JavaScriptファイルや画像・音声などの静的アセットは **Cache-First（キャッシュ優先）** でキャッシュされます。

キャッシュのままだとユーザー側に変更が反映されないため、アプリの起動時に自動でバージョンチェックを行い、アップデートを検出した場合はキャッシュの破棄とサービスワーカーの解除（unregister）を自動で行って画面を強制リロードする仕組みが `App.jsx` に実装されています。

### アップデート（デプロイ）時の必須作業

アセットやプログラムをアップデート（デプロイ）する際は、**以下の3つのバージョン情報を必ずインクリメント（引き上げ）してリリースしてください。**

1. **クライアント側のゲームバージョン設定**
   - [src/utils/constants/config.js](file:///e:/project_arakia/projects/MiniCardBattle/src/utils/constants/config.js) 内の `GAME_VERSION` を変更します。（例：`'0.1.0'` ➔ `'0.1.1'`）
2. **サーバー側のバージョン情報ファイル**
   - [public/version.json](file:///e:/project_arakia/projects/MiniCardBattle/public/version.json) 内の `"version"` を上記と同じバージョンに変更します。（例：`"0.1.0"` ➔ `"0.1.1"`）
     _(※ `version.json` へのアクセスは、サービスワーカーキャッシュの対象外として設定されています)_
3. **サービスワーカーのキャッシュ名**
   - [sw.js](file:///e:/project_arakia/projects/MiniCardBattle/sw.js) および [public/service-worker.js](file:///e:/project_arakia/projects/MiniCardBattle/public/service-worker.js) 最上部にある `CACHE_NAME` を新しいバージョン名に変更します。管理の簡略化のため、末尾のバージョン番号はゲームのバージョン番号と揃えるようにしてください。（例：`'mini-card-battle-v0.1.0'` ➔ `'mini-card-battle-v0.1.1'`）

これらが揃うことで、すでにサービスワーカーが登録されているユーザーに対しても、次回起動時に自動でクリーンなアップデートが適用されます。
なお、この自動アップデート処理はLocalStorage（ゲームのセーブデータなど）を維持したまま機能するため、ユーザーのデータが消失することはありません。
