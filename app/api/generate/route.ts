import { NextRequest } from "next/server";
import { queuePrompt, waitForImage, type GenerateOptions } from "@/app/lib/comfyui";

// 生成は時間がかかるため都度実行（キャッシュしない）。
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: Partial<GenerateOptions>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエストボディが不正です" }, { status: 400 });
  }

  const prompt = (body.prompt ?? "").toString().trim();
  if (!prompt) {
    return Response.json({ error: "prompt は必須です" }, { status: 400 });
  }

  try {
    const promptId = await queuePrompt({
      prompt,
      negativePrompt: body.negativePrompt,
      width: body.width,
      height: body.height,
      steps: body.steps,
    });

    const image = await waitForImage(promptId);

    const params = new URLSearchParams({
      filename: image.filename,
      subfolder: image.subfolder ?? "",
      type: image.type ?? "output",
    });

    return Response.json({
      promptId,
      // ブラウザは同一オリジンのこのプロキシ経由で画像を取得する。
      imageUrl: `/api/image?${params.toString()}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "画像生成に失敗しました";
    return Response.json({ error: message }, { status: 502 });
  }
}
