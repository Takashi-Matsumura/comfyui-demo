import { NextRequest } from "next/server";
import { buildWorkflow, type GenerateParams } from "@/app/lib/comfyui";

export const dynamic = "force-dynamic";

// 画面と同じパラメータから ComfyUI の API フォーマット JSON を組み立てて返す。
// ComfyUI を呼び出さず、グラフをそのまま書き出すだけ（学習用エクスポート）。
export async function POST(request: NextRequest) {
  let body: Partial<GenerateParams>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエストボディが不正です" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").toString().trim();
  if (!prompt) {
    return Response.json({ error: "prompt は必須です" }, { status: 400 });
  }

  const mode = body.mode === "img2img" ? "img2img" : "txt2img";
  if (mode === "img2img" && !body.inputImage) {
    return Response.json({ error: "img2img には入力画像が必要です" }, { status: 400 });
  }

  try {
    const workflow = buildWorkflow({
      mode,
      prompt,
      negativePrompt: body.negativePrompt,
      width: body.width,
      height: body.height,
      steps: body.steps,
      cfg: body.cfg,
      seed: body.seed,
      samplerName: body.samplerName,
      scheduler: body.scheduler,
      denoise: body.denoise,
      upscale: body.upscale,
      upscaleBy: body.upscaleBy,
      inputImage: body.inputImage,
    });
    return Response.json({ workflow });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ワークフローの生成に失敗しました";
    return Response.json({ error: message }, { status: 400 });
  }
}
