// ComfyUI(http://localhost:8188) の HTTP/WebSocket API を叩くためのサーバー専用ロジック。
// このファイルは Route Handler / Server Component からのみ import すること（URL は server-only）。

const COMFYUI_BASE_URL = process.env.COMFYUI_BASE_URL ?? "http://localhost:8188";

// README に記録したローカル導入モデル。環境変数で上書き可能。
const CHECKPOINT_NAME =
  process.env.COMFYUI_CHECKPOINT ?? "v1-5-pruned-emaonly-fp16.safetensors";

// http(s) ベースURL を ws(s) に変換した WebSocket エンドポイント。
export function comfyWebSocketUrl(clientId: string): string {
  const ws = COMFYUI_BASE_URL.replace(/^http/, "ws");
  return `${ws}/ws?clientId=${encodeURIComponent(clientId)}`;
}

export type GenerationMode = "txt2img" | "img2img";

export interface GenerateParams {
  mode: GenerationMode;
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  samplerName?: string;
  scheduler?: string;
  // img2img の変化量（0=元画像のまま, 1=完全に作り直し）
  denoise?: number;
  // hires-fix 風の2パス目アップスケール
  upscale?: boolean;
  upscaleBy?: number;
  // img2img の入力画像（/api/upload が返す LoadImage 用の名前）
  inputImage?: string;
}

// ComfyUI /history・/ws が返す画像参照。
export interface ComfyImageRef {
  filename: string;
  subfolder: string;
  type: string;
}

// 接続ノードの型（[ノードID, 出力インデックス]）。
type Link = [string, number];
interface ComfyNode {
  class_type: string;
  inputs: Record<string, unknown>;
}

// パラメータからワークフロー(API フォーマット)を組み立てる。
// モード・アップスケールの有無でノードグラフを動的に構成する。
// /api/workflow からも再利用し、ComfyUI へ読み込ませる JSON として書き出す。
export function buildWorkflow(params: GenerateParams): Record<string, ComfyNode> {
  const seed = params.seed ?? Math.floor(Math.random() * 1_000_000_000_000_000);
  const steps = params.steps ?? 20;
  const cfg = params.cfg ?? 8;
  const samplerName = params.samplerName ?? "euler";
  const scheduler = params.scheduler ?? "normal";

  const nodes: Record<string, ComfyNode> = {
    "4": { class_type: "CheckpointLoaderSimple", inputs: { ckpt_name: CHECKPOINT_NAME } },
    "6": { class_type: "CLIPTextEncode", inputs: { text: params.prompt, clip: ["4", 1] } },
    "7": { class_type: "CLIPTextEncode", inputs: { text: params.negativePrompt ?? "", clip: ["4", 1] } },
  };

  // --- 潜在(latent)の入力元: txt2img は空, img2img は入力画像をエンコード ---
  let latentSource: Link;
  let firstDenoise: number;
  if (params.mode === "img2img") {
    if (!params.inputImage) {
      throw new Error("img2img には入力画像が必要です");
    }
    nodes["10"] = { class_type: "LoadImage", inputs: { image: params.inputImage } };
    nodes["11"] = { class_type: "VAEEncode", inputs: { pixels: ["10", 0], vae: ["4", 2] } };
    latentSource = ["11", 0];
    firstDenoise = params.denoise ?? 0.75;
  } else {
    nodes["5"] = {
      class_type: "EmptyLatentImage",
      inputs: { width: params.width ?? 512, height: params.height ?? 512, batch_size: 1 },
    };
    latentSource = ["5", 0];
    firstDenoise = 1.0;
  }

  // --- 1パス目サンプリング ---
  nodes["3"] = {
    class_type: "KSampler",
    inputs: {
      seed,
      steps,
      cfg,
      sampler_name: samplerName,
      scheduler,
      denoise: firstDenoise,
      model: ["4", 0],
      positive: ["6", 0],
      negative: ["7", 0],
      latent_image: latentSource,
    },
  };

  // --- アップスケール(2パス): LatentUpscaleBy → 低 denoise の2パス目 ---
  let finalLatent: Link = ["3", 0];
  if (params.upscale) {
    nodes["12"] = {
      class_type: "LatentUpscaleBy",
      inputs: { samples: ["3", 0], upscale_method: "nearest-exact", scale_by: params.upscaleBy ?? 1.5 },
    };
    nodes["13"] = {
      class_type: "KSampler",
      inputs: {
        seed: seed + 1,
        steps,
        cfg,
        sampler_name: samplerName,
        scheduler,
        denoise: 0.5,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["12", 0],
      },
    };
    finalLatent = ["13", 0];
  }

  // --- デコード & 保存 ---
  nodes["8"] = { class_type: "VAEDecode", inputs: { samples: finalLatent, vae: ["4", 2] } };
  nodes["9"] = { class_type: "SaveImage", inputs: { filename_prefix: "nextjs", images: ["8", 0] } };

  return nodes;
}

// ワークフローをキューに投入し prompt_id を返す。client_id で /ws の進捗と紐付ける。
export async function queuePrompt(params: GenerateParams, clientId: string): Promise<string> {
  const res = await fetch(`${COMFYUI_BASE_URL}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: buildWorkflow(params), client_id: clientId }),
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

// 画像を ComfyUI /upload/image に中継し、LoadImage で参照できる名前を返す。
export async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("image", file, file.name);
  form.append("overwrite", "true");

  const res = await fetch(`${COMFYUI_BASE_URL}/upload/image`, { method: "POST", body: form });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`ComfyUI /upload/image がエラーを返しました (${res.status}): ${detail}`);
  }

  const data = (await res.json()) as { name: string; subfolder?: string };
  // サブフォルダがある場合は "subfolder/name" の形で参照する。
  return data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
}

// ComfyUI /view から画像バイト列を取得する（プロキシ用）。
export async function fetchImage(ref: ComfyImageRef): Promise<Response> {
  const params = new URLSearchParams({
    filename: ref.filename,
    subfolder: ref.subfolder,
    type: ref.type,
  });
  return fetch(`${COMFYUI_BASE_URL}/view?${params.toString()}`, { cache: "no-store" });
}

const FALLBACK_SAMPLERS = ["euler", "euler_ancestral", "dpmpp_2m", "dpmpp_2m_sde", "ddim"];
const FALLBACK_SCHEDULERS = ["normal", "karras", "exponential", "simple", "sgm_uniform"];

// object_info から KSampler の選択肢（sampler/scheduler）を取得する。
// ComfyUI 停止時はフォールバックを返すので、ページレンダリングは失敗しない。
export async function getSamplerOptions(): Promise<{ samplers: string[]; schedulers: string[] }> {
  try {
    const res = await fetch(`${COMFYUI_BASE_URL}/object_info/KSampler`, { cache: "no-store" });
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = (await res.json()) as {
      KSampler?: { input?: { required?: { sampler_name?: [string[]]; scheduler?: [string[]] } } };
    };
    const required = data.KSampler?.input?.required;
    return {
      samplers: required?.sampler_name?.[0] ?? FALLBACK_SAMPLERS,
      schedulers: required?.scheduler?.[0] ?? FALLBACK_SCHEDULERS,
    };
  } catch {
    return { samplers: FALLBACK_SAMPLERS, schedulers: FALLBACK_SCHEDULERS };
  }
}
