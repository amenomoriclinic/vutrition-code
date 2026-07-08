# 栄養管理アプリ 導入手順書

この手順書は、プログラミングに慣れていない方でも、このアプリを自分の環境で動かせるように作成しています。

想定している使い方は次の流れです。

1. GitHubでこのリポジトリをフォーク
2. Supabaseでデータベースを作成
3. Vercelでデプロイ
4. 環境変数を設定
5. 本番URLで動作確認

---

## 1. 必要なアカウントの作成

最初に以下のアカウントを用意してください。

### 1-1. GitHubアカウント

- サイト: https://github.com/
- 使い道: ソースコードを管理します（フォーク元・デプロイ元になります）。

### 1-2. Vercelアカウント

- サイト: https://vercel.com/
- 使い道: Webアプリを公開します。

### 1-3. Supabaseアカウント

- サイト: https://supabase.com/
- 使い道: 食事記録データを保存するデータベースを作成します。

### 1-4. Anthropic APIキーの取得

- サイト: https://console.anthropic.com/
- 使い道: 画像から栄養情報を推定するAPIで使用します。
- 取得したAPIキーは後でVercelの環境変数 `ANTHROPIC_API_KEY` に設定します。

---

## 2. GitHubリポジトリのフォーク方法

1. このリポジトリのGitHubページを開く
2. 右上の Fork ボタンを押す
3. 自分のアカウントを選んでフォークを作成

これで「自分のGitHubアカウント配下」に同じリポジトリが作成されます。

---

## 3. Supabaseのセットアップ

### 3-1. プロジェクト作成

1. Supabaseにログイン
2. New project を押す
3. プロジェクト名・パスワード・リージョンを設定して作成

### 3-2. テーブル作成SQLの実行

1. Supabaseダッシュボードで SQL Editor を開く
2. このリポジトリの db/supabase_create_table.sql の内容を貼り付け
3. Run で実行

これで nutrition_records テーブルが作成されます。

### 3-3. APIキーとURLの取得

Supabaseの Project Settings → API で次を取得します。

- Project URL
- Project API Keys の anon public

この2つは後でVercelに設定します。

---

## 4. Vercelへのデプロイ方法

### 4-1. GitHubと連携してデプロイ

1. Vercelにログイン
2. Add New... → Project を選択
3. GitHub連携を許可（初回のみ）
4. 先ほどフォークしたリポジトリを選択
5. Deploy を実行

### 4-2. 環境変数の設定

Vercelの対象プロジェクトで Settings → Environment Variables を開き、以下を追加してください。

- ANTHROPIC_API_KEY
  - 値: Anthropicで取得したAPIキー
- NEXT_PUBLIC_SUPABASE_URL
  - 値: SupabaseのProject URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
  - 値: Supabaseのanon publicキー

設定後、必ず再デプロイしてください。

再デプロイ方法:

1. Deployments を開く
2. 最新デプロイのメニューから Redeploy を実行

---

## 5. 動作確認方法

本番URLを開いて、次の順で確認してください。

1. 食事記録
   - 料理写真モードまたは栄養表示ラベルモードで推定
   - 保存後、記録一覧に追加される
2. マイ定番食品
   - 定番食品ボタンをタップ
   - 記録一覧に追加される
3. 運動記録
   - 手動でkcal入力して保存
   - 記録一覧・日次集計・グラフに反映される
4. Supabase確認
   - Table Editor で nutrition_records を開く
   - 保存したデータが追加されている

---

## トラブルシューティング

### 保存に失敗する場合

- Vercelの環境変数が正しいか再確認
- 再デプロイ済みか確認
- Supabaseのテーブル作成SQLが実行済みか確認

### 更新内容が画面に反映されない場合

- PWAキャッシュが残っている可能性があります
- 一度ブラウザの再読み込み（PCなら強制再読み込み）を実施
- スマホでホーム画面起動している場合は、ブラウザで直接URLを開いて確認

---

## ローカルで動かす場合（任意）

ローカル実行したい場合のみ、以下を実行してください。

1. Node.jsをインストール
2. このリポジトリをクローン
3. 依存関係をインストール

```bash
npm install
```

4. .env.local を作成して環境変数を設定

```env
ANTHROPIC_API_KEY=your_anthropic_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

5. 開発サーバーを起動

```bash
npm run dev
```
