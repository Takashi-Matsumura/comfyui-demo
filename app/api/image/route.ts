import { NextRequest } from "next/server";
import { fetchImage } from "@/app/lib/comfyui";

export const dynamic = "force-dynamic";

// ComfyUI が画像を返しうる type のみ許可（input は読み取り対象にしない）。
const ALLOWED_TYPES = new Set(["output", "temp"]);
// 上流から転送してよい Content-Type の許可リスト。
const ALLOWED_CONTENT_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

// パストラバーサル防止: 区切り文字や親ディレクトリ参照を含む値を弾く。
function isSafeSegment(value: string): boolean {
  if (value.includes("..") || value.includes("/") || value.includes("\\")) {
    return false;
  }
  // NUL やパーセントエンコードされた区切りも拒否。
  return !/[\0]|%2e%2e|%2f|%5c/i.test(value);
}

// ComfyUI の /view を同一オリジンでプロキシする。
// クライアント由来の filename/subfolder/type をそのまま上流に渡すため、
// パストラバーサル/SSRF を防ぐ厳格なバリデーションを行う。
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const filename = sp.get("filename");
  const subfolder = sp.get("subfolder") ?? "";
  const type = sp.get("type") ?? "output";

  if (!filename || !isSafeSegment(filename)) {
    return new Response("filename が不正です", { status: 400 });
  }
  if (subfolder && !isSafeSegment(subfolder)) {
    return new Response("subfolder が不正です", { status: 400 });
  }
  if (!ALLOWED_TYPES.has(type)) {
    return new Response("type が不正です", { status: 400 });
  }

  const upstream = await fetchImage({ filename, subfolder, type });

  if (!upstream.ok || !upstream.body) {
    return new Response("画像が見つかりませんでした", { status: upstream.status || 502 });
  }

  // 上流の Content-Type は許可リストのもののみ転送。それ以外はブラウザに解釈させない。
  const upstreamType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  const contentType =
    upstreamType && ALLOWED_CONTENT_TYPES.has(upstreamType)
      ? upstreamType
      : "application/octet-stream";

  return new Response(upstream.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${filename}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "no-store",
    },
  });
}
