# comfyui-demo

ローカルの ComfyUI（画像生成AI）を、別コンテナで動く Next.js アプリから HTTP API 経由で
利用するためのデモプロジェクト。

このリポジトリは Next.js アプリ本体に加えて、**macOS / Apple Silicon 上に ComfyUI を
ローカル構築した際の手順とメモ**を記録しています。

---

## ComfyUI ローカル環境（macOS / Apple Silicon）

### 構築した環境

| 項目 | 値 |
| --- | --- |
| マシン | Apple M5 / メモリ 32GB / macOS 26.5 |
| GPU バックエンド | MPS（Metal Performance Shaders）|
| Python | 3.12.13（Homebrew `python@3.12`、システムの 3.14 とは分離）|
| PyTorch | 2.12.0（MPS 対応）|
| ComfyUI 配置先 | `~/ComfyUI` |
| 仮想環境 | `~/ComfyUI/venv` |

> **なぜ Python 3.12 か**: システムの Python 3.14 は新しすぎて、ComfyUI の一部依存
> パッケージがまだ未対応のリスクがあるため、専用に 3.12 を用意し venv で隔離している。

### 導入モデル

| 項目 | 値 |
| --- | --- |
| モデル | Stable Diffusion 1.5（Comfy-Org 公式アーカイブ版）|
| ファイル名 | `v1-5-pruned-emaonly-fp16.safetensors` |
| 形式 | **FP16**（MPS では FP8 が動かないため FP16/BF16 を選択）|
| サイズ | 約 2.0 GB |
| 配置パス | `~/ComfyUI/models/checkpoints/v1-5-pruned-emaonly-fp16.safetensors` |
| 入手元 | <https://huggingface.co/Comfy-Org/stable-diffusion-v1-5-archive> |

ダウンロードコマンド:

```bash
curl -L -o ~/ComfyUI/models/checkpoints/v1-5-pruned-emaonly-fp16.safetensors \
  https://huggingface.co/Comfy-Org/stable-diffusion-v1-5-archive/resolve/main/v1-5-pruned-emaonly-fp16.safetensors
```

### 起動方法

**通常起動（ローカルのブラウザからのみアクセス）**

```bash
~/ComfyUI/venv/bin/python ~/ComfyUI/main.py
```

- `127.0.0.1:8188` にのみバインドされる（このMac内からのみ到達可能）
- ブラウザで <http://127.0.0.1:8188> を開く

**`--listen` 起動（外部 / 別コンテナから API 接続可能にする）**

```bash
~/ComfyUI/venv/bin/python ~/ComfyUI/main.py --listen 0.0.0.0 --port 8188
```

- `0.0.0.0`（全ネットワークインターフェース）にバインドし、別マシン / Docker コンテナから到達可能になる
- Docker コンテナ内の Next.js からは `host.docker.internal:8188` でこのMacホストへ接続する
- ⚠️ **セキュリティ注意**: LAN 内の他端末からも到達可能になるため、信頼できるネットワークでのみ使用すること

### API ベースURL

| 用途 | URL |
| --- | --- |
| ローカルのブラウザ / 同一ホスト | `http://localhost:8188` |
| Docker コンテナ → Macホスト | `http://host.docker.internal:8188` |

### 動作確認の手順（初回）

1. 通常起動し <http://127.0.0.1:8188> を開く
2. 左上の ComfyUI ロゴ → ワークフロー → テンプレートを参照 → 「1.1 入門 – テキストから画像」を選択
3. `Load Model`（CheckpointLoaderSimple）の checkpoint を
   `v1-5-pruned-emaonly-fp16.safetensors` に設定
   （テンプレートは別モデル `DreamShaper_8` を指定しているため差し替えが必要）
4. 右上「実行する」を押すと生成開始。`~/ComfyUI/output/` に PNG が保存される

> 生成例: 20 ステップで約 23 秒（M5 / MPS, 512×512）。

---

## Next.js アプリ（画像生成デモ）

プロンプトを入力すると、ローカルの ComfyUI を HTTP/WebSocket API 経由で叩いて画像を生成し、
画面に表示するデモ（Next.js 16 / App Router）。

### 機能

- **txt2img / img2img**（入力画像アップロード → 変換、denoise で変化量を制御）
- **生成パラメータ制御**: ネガティブプロンプト / サイズ / ステップ / CFG / シード / サンプラー / スケジューラ
- **リアルタイム進捗表示**: ComfyUI の WebSocket `/ws` をサーバーで購読し、SSE で進捗(%)を転送
- **アップスケール**: `LatentUpscaleBy` + 低 denoise の2パス目（hires-fix 風、追加モデル不要）

サンプラー / スケジューラの一覧は ComfyUI の `object_info` から動的に取得（ComfyUI 停止時はフォールバック）。

### セットアップ・起動

```bash
cp .env.example .env.local   # ComfyUI のベースURL等を設定
npm run dev
```

1. 先に ComfyUI を起動しておく（上記「起動方法」参照）
2. <http://localhost:3000> を開き、プロンプトを入力して「画像を生成」

### 構成

| ファイル | 役割 |
| --- | --- |
| `app/page.tsx` | トップページ（Server Component。`object_info` から選択肢取得 → `Generator` へ）|
| `app/components/Generator.tsx` | 入力フォーム + 進捗バー + 結果表示（Client Component）|
| `app/api/generate/route.ts` | ワークフローを `/prompt` に投入し `prompt_id` を返す（POST）|
| `app/api/progress/route.ts` | ComfyUI `/ws` を購読し進捗・完成画像を SSE で転送（GET）|
| `app/api/upload/route.ts` | img2img 入力画像を `/upload/image` へ中継（POST）|
| `app/api/image/route.ts` | ComfyUI `/view` を同一オリジンでプロキシ（コンテナ移行に備える）|
| `app/lib/comfyui.ts` | ワークフローJSON生成 + ComfyUI 呼び出し（server-only）|

### 生成フロー（進捗の取りこぼし防止）

```
1. ブラウザが EventSource で /api/progress に接続
2. サーバーが ComfyUI /ws に接続し、開通したら {type:"ready"} を送る
3. ブラウザは ready を受けてから /api/generate を投入（client_id で紐付け）
4. progress イベント → 進捗バー / executed イベント → 完成画像を表示
```

### 動作確認手順（プロンプト例）

ブラウザ（<http://localhost:3000>）をリロードしてから、各機能を確認する。

**① 生成パラメータ制御** — `txt2img` タブ。シード `12345` を固定して2回生成 → 同じ絵になる（再現性）。
サンプラーを `euler` → `dpmpp_2m` に変更、CFG を 3 と 15 で比較すると絵柄・忠実度が変わる。

```
a cozy wooden cabin in a snowy forest, warm light from windows, pine trees, highly detailed, cinematic lighting
```

**② リアルタイム進捗表示** — ステップを `40` にして生成。ボタン下に進捗バーと `%（n/40）` が伸びる。

```
an epic fantasy castle on a floating island, waterfalls, dramatic clouds, golden hour, highly detailed
```

**③ img2img** — `img2img` タブで入力画像をアップロード。変化量(denoise) `0.4`（元画像を残す）と `0.8`（大きく変化）を比較。

```
the same scene repainted in vivid anime style, vibrant colors, clean lineart
```

**④ アップスケール** — `txt2img` で 512×512、「アップスケール（×1.5 2パス）」にチェック。進捗が2パス分流れ、出力が **768×768** になる。

```
a lighthouse on a cliff at sunset, calm ocean, orange and purple sky, photorealistic
```

> 1枚あたり概ね 20〜30 秒（ステップ数・アップスケールで増減）。ComfyUI(:8188) と開発サーバ(:3000) の起動が前提。

### 環境変数（`.env.local`）

| 変数 | 既定値 | 説明 |
| --- | --- | --- |
| `COMFYUI_BASE_URL` | `http://localhost:8188` | ComfyUI の API ベースURL。コンテナからは `http://host.docker.internal:8188` |
| `COMFYUI_CHECKPOINT` | `v1-5-pruned-emaonly-fp16.safetensors` | 使用するチェックポイント |

> 注意: この Next.js は通常版と異なる破壊的変更を含む（`params`/`cookies`/`headers` が Promise、
> GET Route Handler が既定 dynamic、Turbopack 既定 等）。コードを書く前に
> `node_modules/next/dist/docs/` の該当ガイドを参照すること（`AGENTS.md` 参照）。
