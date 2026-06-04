import Generator from "@/app/components/Generator";
import { getSamplerOptions } from "@/app/lib/comfyui";

// ComfyUI が停止していてもページは表示できるよう、毎リクエストで動的に取得。
export const dynamic = "force-dynamic";

export default async function Home() {
  const { samplers, schedulers } = await getSamplerOptions();
  // ブラウザから開く ComfyUI 画面の URL。サーバ専用の接続先（docker 等で異なる場合あり）
  // とは別に指定できるよう専用の環境変数を用意し、未設定ならローカル既定値。
  const comfyuiUrl = process.env.COMFYUI_PUBLIC_URL ?? "http://localhost:8188";

  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-6xl flex-1 flex-col items-center gap-8 px-6 py-12 sm:py-16">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            ComfyUI 画像生成デモ
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            txt2img / img2img・各種パラメータ・進捗表示・アップスケールを試せます。
          </p>
        </header>
        <Generator samplers={samplers} schedulers={schedulers} comfyuiUrl={comfyuiUrl} />
      </main>
    </div>
  );
}
