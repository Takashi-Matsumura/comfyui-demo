import { NextRequest } from "next/server";
import { fetchImage } from "@/app/lib/comfyui";

export const dynamic = "force-dynamic";

// ComfyUI の /view を同一オリジンでプロキシする。
// これにより、将来 ComfyUI を別ホスト/コンテナに移してもブラウザ側のコードは変えずに済む。
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filename = sp.get("filename");
  if (!filename) {
    return new Response("filename が必要です", { status: 400 });
  }

  const upstream = await fetchImage({
    filename,
    subfolder: sp.get("subfolder") ?? "",
    type: sp.get("type") ?? "output",
  });

  if (!upstream.ok || !upstream.body) {
    return new Response("画像が見つかりませんでした", { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/png",
      "Cache-Control": "no-store",
    },
  });
}
