import { NextRequest } from "next/server";
import { queuePrompt, type GenerateParams } from "@/app/lib/comfyui";

export const dynamic = "force-dynamic";

// ワークフローをキューに投入し prompt_id を返す。
// 進捗と完成画像は /api/progress (SSE) 経由で受け取る。
export async function POST(request: NextRequest) {
  let body: Partial<GenerateParams> & { clientId?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエストボディが不正です" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").toString().trim();
  if (!prompt) {
    return Response.json({ error: "prompt は必須です" }, { status: 400 });
  }
  const clientId = (body.clientId ?? "").toString();
  if (!clientId) {
    return Response.json({ error: "clientId は必須です" }, { status: 400 });
  }

  const mode = body.mode === "img2img" ? "img2img" : "txt2img";
  if (mode === "img2img" && !body.inputImage) {
    return Response.json({ error: "img2img には入力画像が必要です" }, { status: 400 });
  }

  try {
    const promptId = await queuePrompt(
      {
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
      },
      clientId,
    );
    return Response.json({ promptId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "画像生成に失敗しました";
    return Response.json({ error: message }, { status: 502 });
  }
}
