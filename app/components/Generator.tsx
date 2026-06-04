"use client";

import { useState } from "react";

export default function Generator() {
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = prompt.trim();
    if (!trimmed || isLoading) return;

    setIsLoading(true);
    setError(null);
    setImageUrl(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "生成に失敗しました");
      }
      setImageUrl(data.imageUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成に失敗しました");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <label
          htmlFor="prompt"
          className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          プロンプト（英語推奨）
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="a cat astronaut floating in space, highly detailed"
          className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <button
          type="submit"
          disabled={isLoading || !prompt.trim()}
          className="flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isLoading ? "生成中…（数十秒かかります）" : "画像を生成"}
        </button>
      </form>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
        {isLoading ? (
          <span className="text-sm text-zinc-500">ComfyUI で生成しています…</span>
        ) : imageUrl ? (
          // 同一オリジンの /api/image プロキシ経由。next/image は不要なため通常の img を使用。
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="生成された画像" className="h-full w-full object-contain" />
        ) : (
          <span className="text-sm text-zinc-400">ここに生成画像が表示されます</span>
        )}
      </div>
    </div>
  );
}
