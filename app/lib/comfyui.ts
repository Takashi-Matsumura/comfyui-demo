// ComfyUI(http://localhost:8188) の HTTP API を叩くためのサーバー専用ロジック。
// このファイルは Route Handler からのみ import すること（COMFYUI_BASE_URL は server-only）。

const COMFYUI_BASE_URL = process.env.COMFYUI_BASE_URL ?? "http://localhost:8188";

// README に記録したローカル導入モデル。環境変数で上書き可能。
const CHECKPOINT_NAME =
  process.env.COMFYUI_CHECKPOINT ?? "v1-5-pruned-emaonly-fp16.safetensors";

export interface GenerateOptions {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
}

// ComfyUI /history が返す画像参照。
export interface ComfyImageRef {
  filename: string;
  subfolder: string;
  type: string;
}

// SD1.5 テキスト→画像の最小ワークフローを API フォーマットで組み立てる。
// ノードID/接続は ComfyUI 標準のデフォルトワークフローに準拠。
function buildWorkflow(opts: GenerateOptions) {
  const seed =
    opts.seed ?? Math.floor(Math.random() * 1_000_000_000_000_000);

  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: opts.steps ?? 20,
        cfg: opts.cfg ?? 8,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: CHECKPOINT_NAME },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: {
        width: opts.width ?? 512,
        height: opts.height ?? 512,
        batch_size: 1,
      },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: opts.prompt, clip: ["4", 1] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: opts.negativePrompt ?? "", clip: ["4", 1] },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["4", 2] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "nextjs", images: ["8", 0] },
    },
  };
}

// ワークフローをキューに投入し、prompt_id を返す。
export async function queuePrompt(opts: GenerateOptions): Promise<string> {
  const res = await fetch(`${COMFYUI_BASE_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: buildWorkflow(opts) }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`ComfyUI /prompt がエラーを返しました (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { prompt_id?: string };
  if (!data.prompt_id) {
    throw new Error("ComfyUI から prompt_id が返りませんでした");
  }
  return data.prompt_id;
}

// /history/{id} をポーリングし、生成完了した画像参照を返す。
export async function waitForImage(
  promptId: string,
  { timeoutMs = 180_000, intervalMs = 1_000 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<ComfyImageRef> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${COMFYUI_BASE_URL}/history/${promptId}`, {
      cache: "no-store",
    });

    if (res.ok) {
      const history = (await res.json()) as Record<
        string,
        { outputs?: Record<string, { images?: ComfyImageRef[] }> }
      >;
      const outputs = history[promptId]?.outputs;
      if (outputs) {
        for (const nodeId of Object.keys(outputs)) {
          const images = outputs[nodeId].images;
          if (images && images.length > 0) {
            return images[0];
          }
        }
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error("画像生成がタイムアウトしました（ComfyUI が起動しているか確認してください）");
}

// ComfyUI /view から画像バイト列を取得する（プロキシ用）。
export async function fetchImage(ref: ComfyImageRef): Promise<Response> {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  return fetch(`${COMFYUI_BASE_URL}/view?${params.toString()}`, {
    cache: "no-store",
  });
}
