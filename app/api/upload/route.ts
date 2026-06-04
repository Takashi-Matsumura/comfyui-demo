import { NextRequest } from "next/server";
import { uploadImage } from "@/app/lib/comfyui";

export const dynamic = "force-dynamic";

const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 10 * 1024 * 1024; // 10MB

// img2img 用の入力画像を受け取り ComfyUI に中継する。
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "フォームデータが不正です" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return Response.json({ error: "image ファイルが必要です" }, { status: 400 });
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return Response.json({ error: "PNG / JPEG / WebP のみ対応しています" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return Response.json({ error: "画像は 10MB 以下にしてください" }, { status: 400 });
  }

  try {
    const inputImage = await uploadImage(file);
    return Response.json({ inputImage });
  } catch (error) {
    const message = error instanceof Error ? error.message : "アップロードに失敗しました";
    return Response.json({ error: message }, { status: 502 });
  }
}
