import { NextRequest } from "next/server";
import { comfyWebSocketUrl } from "@/app/lib/comfyui";

export const dynamic = "force-dynamic";

// ComfyUI の WebSocket(/ws) をサーバー側で購読し、進捗と完成画像を
// Server-Sent Events としてブラウザへ転送する。
//
// フロー:
//   1. ブラウザが EventSource でこのエンドポイントに接続
//   2. サーバーが ComfyUI /ws に接続し、開通したら {type:"ready"} を送る
//   3. ブラウザは ready を受けてから /api/generate を叩く（進捗の取りこぼし防止）
//   4. progress イベント → 進捗(%)、executed イベント(画像あり) → 完成 → クローズ
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return new Response("clientId が必要です", { status: 400 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const ws = new WebSocket(comfyWebSocketUrl(clientId));

      const send = (obj: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearTimeout(timer);
        try {
          ws.close();
        } catch {}
        try {
          controller.close();
        } catch {}
      };

      // 5分のセーフティタイムアウト。
      const timer = setTimeout(() => {
        send({ type: "error", error: "進捗の待機がタイムアウトしました" });
        close();
      }, 5 * 60 * 1000);

      ws.onopen = () => send({ type: "ready" });

      ws.onmessage = (event) => {
        // バイナリ(プレビュー画像)は無視し、JSON テキストのみ処理。
        if (typeof event.data !== "string") return;
        let msg: { type?: string; data?: Record<string, unknown> };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.type === "progress" && msg.data) {
          send({ type: "progress", value: msg.data.value, max: msg.data.max });
          return;
        }

        if (msg.type === "executed" && msg.data) {
          const output = msg.data.output as { images?: { filename: string; subfolder?: string; type?: string }[] } | undefined;
          const image = output?.images?.[0];
          if (image) {
            const params = new URLSearchParams({
              filename: image.filename,
              subfolder: image.subfolder ?? "",
              type: image.type ?? "output",
            });
            send({ type: "done", imageUrl: `/api/image?${params.toString()}` });
            close();
          }
        }
      };

      ws.onerror = () => {
        send({ type: "error", error: "ComfyUI への接続に失敗しました（起動を確認してください）" });
        close();
      };

      // ブラウザが切断したら後始末。
      request.signal.addEventListener("abort", close);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
