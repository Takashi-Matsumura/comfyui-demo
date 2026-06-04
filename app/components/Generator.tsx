"use client";

import { useRef, useState } from "react";
import { MANUAL_PRESETS } from "../lib/presets";

type Mode = "txt2img" | "img2img";

interface GeneratorProps {
  samplers: string[];
  schedulers: string[];
}

// ラベル付きスライダー（数値入力）。
function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex justify-between text-zinc-700 dark:text-zinc-300">
        <span>{label}</span>
        <span className="font-mono text-zinc-500">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-zinc-800 dark:accent-zinc-200"
      />
    </label>
  );
}

export default function Generator({ samplers, schedulers }: GeneratorProps) {
  const [mode, setMode] = useState<Mode>("txt2img");
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const [steps, setSteps] = useState(20);
  const [cfg, setCfg] = useState(8);
  const [seed, setSeed] = useState(""); // 空ならランダム
  const [samplerName, setSamplerName] = useState(samplers[0] ?? "euler");
  const [scheduler, setScheduler] = useState(schedulers[0] ?? "normal");
  const [denoise, setDenoise] = useState(0.75);
  const [upscale, setUpscale] = useState(false);

  // img2img 入力画像
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [inputPreview, setInputPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // 生成状態
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<{ value: number; max: number } | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const esRef = useRef<EventSource | null>(null);

  async function handleUpload(file: File) {
    setIsUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "アップロードに失敗しました");
      setInputImage(data.inputImage);
      setInputPreview(URL.createObjectURL(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "アップロードに失敗しました");
    } finally {
      setIsUploading(false);
    }
  }

  function cleanup() {
    esRef.current?.close();
    esRef.current = null;
  }

  // プリセットを選択 → ポジティブ/ネガティブ両欄へ流し込む。
  function applyPreset(preset: (typeof MANUAL_PRESETS)[number]) {
    setPrompt(preset.prompt);
    setNegativePrompt(preset.negativePrompt);
  }

  function handleGenerate() {
    const trimmed = prompt.trim();
    if (!trimmed || isLoading) return;
    if (mode === "img2img" && !inputImage) {
      setError("img2img では先に入力画像をアップロードしてください");
      return;
    }

    setIsLoading(true);
    setError(null);
    setImageUrl(null);
    setProgress(null);

    const clientId = crypto.randomUUID();
    const params = {
      clientId,
      mode,
      prompt: trimmed,
      negativePrompt: negativePrompt.trim() || undefined,
      width,
      height,
      steps,
      cfg,
      seed: seed.trim() === "" ? undefined : Number(seed),
      samplerName,
      scheduler,
      denoise,
      upscale,
      inputImage: mode === "img2img" ? inputImage : undefined,
    };

    // 1. SSE 接続 → ready を受けてから生成投入（進捗取りこぼし防止）
    const es = new EventSource(`/api/progress?clientId=${clientId}`);
    esRef.current = es;

    es.onmessage = async (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "ready") {
        // 2. 生成をキューに投入
        try {
          const res = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "生成に失敗しました");
        } catch (err) {
          setError(err instanceof Error ? err.message : "生成に失敗しました");
          setIsLoading(false);
          cleanup();
        }
      } else if (msg.type === "progress") {
        setProgress({ value: msg.value, max: msg.max });
      } else if (msg.type === "done") {
        setImageUrl(msg.imageUrl);
        setIsLoading(false);
        setProgress(null);
        cleanup();
      } else if (msg.type === "error") {
        setError(msg.error);
        setIsLoading(false);
        cleanup();
      }
    };

    es.onerror = () => {
      setError("進捗ストリームの接続に失敗しました");
      setIsLoading(false);
      cleanup();
    };
  }

  const progressPct =
    progress && progress.max > 0 ? Math.round((progress.value / progress.max) * 100) : 0;

  return (
    <div className="flex w-full flex-col gap-6">
      {/* モード切替 */}
      <div className="flex w-full rounded-lg border border-zinc-300 p-1 dark:border-zinc-700">
        {(["txt2img", "img2img"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              mode === m
                ? "bg-foreground text-background"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* img2img: 入力画像 */}
      {mode === "img2img" && (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">入力画像</span>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
            className="text-sm text-zinc-600 file:mr-3 file:rounded-full file:border-0 file:bg-zinc-200 file:px-4 file:py-2 file:text-sm dark:text-zinc-400 dark:file:bg-zinc-700"
          />
          {isUploading && <span className="text-xs text-zinc-500">アップロード中…</span>}
          {inputPreview && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={inputPreview} alt="入力画像" className="max-h-40 w-fit rounded-lg border border-zinc-300 dark:border-zinc-700" />
          )}
          <Slider label="変化量 (denoise)" value={denoise} min={0.1} max={1} step={0.05} onChange={setDenoise} />
        </div>
      )}

      {/* サンプルプロンプト（操作マニュアル向けプリセット） */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          サンプルプロンプト（操作マニュアル向け）
        </span>
        <div className="flex flex-wrap gap-2">
          {MANUAL_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              title={preset.description}
              className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 transition-colors hover:border-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* プロンプト */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">プロンプト（英語推奨）</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder="a cat astronaut floating in space, highly detailed"
          className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>

      {/* ネガティブプロンプト */}
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-zinc-700 dark:text-zinc-300">ネガティブプロンプト</span>
        <textarea
          value={negativePrompt}
          onChange={(e) => setNegativePrompt(e.target.value)}
          rows={2}
          placeholder="lowres, bad anatomy, blurry, extra fingers"
          className="w-full resize-y rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </label>

      {/* 詳細パラメータ（デフォルトは折りたたみ） */}
      <details className="rounded-lg border border-zinc-300 dark:border-zinc-700">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          詳細設定（サイズ・ステップ・CFG・シードなど）
        </summary>
        <div className="grid grid-cols-2 gap-4 border-t border-zinc-200 px-4 py-4 dark:border-zinc-800">
        {mode === "txt2img" && (
          <>
            <Slider label="幅" value={width} min={256} max={1024} step={64} onChange={setWidth} />
            <Slider label="高さ" value={height} min={256} max={1024} step={64} onChange={setHeight} />
          </>
        )}
        <Slider label="ステップ数" value={steps} min={1} max={50} step={1} onChange={setSteps} />
        <Slider label="CFG" value={cfg} min={1} max={20} step={0.5} onChange={setCfg} />

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-700 dark:text-zinc-300">サンプラー</span>
          <select
            value={samplerName}
            onChange={(e) => setSamplerName(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {samplers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-700 dark:text-zinc-300">スケジューラ</span>
          <select
            value={scheduler}
            onChange={(e) => setScheduler(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {schedulers.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-zinc-700 dark:text-zinc-300">シード（空=ランダム）</span>
          <input
            type="number"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="random"
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex items-center gap-2 self-end text-sm text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={upscale}
            onChange={(e) => setUpscale(e.target.checked)}
            className="h-4 w-4 accent-zinc-800 dark:accent-zinc-200"
          />
          アップスケール（×1.5 2パス）
        </label>
        </div>
      </details>

      {/* 生成ボタン */}
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isLoading || !prompt.trim()}
        className="flex h-11 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? "生成中…" : "画像を生成"}
      </button>

      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </p>
      )}

      {/* 進捗バー */}
      {isLoading && (
        <div className="flex flex-col gap-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-150"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-center text-xs text-zinc-500">
            {progress ? `${progressPct}%（${progress.value}/${progress.max} ステップ）` : "ComfyUI に投入中…"}
          </span>
        </div>
      )}

      {/* 結果 */}
      <div className="flex min-h-64 w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="生成された画像" className="h-full w-full object-contain" />
        ) : (
          !isLoading && <span className="text-sm text-zinc-400">ここに生成画像が表示されます</span>
        )}
      </div>
    </div>
  );
}
