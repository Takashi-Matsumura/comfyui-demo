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

## Next.js アプリ（このリポジトリ本体）

```bash
npm run dev
```

<http://localhost:3000> をブラウザで開く。`app/page.tsx` を編集すると自動更新される。

> 注意: この Next.js は通常版と異なる破壊的変更を含む。コードを書く前に
> `node_modules/next/dist/docs/` の該当ガイドを参照すること（`AGENTS.md` 参照）。
