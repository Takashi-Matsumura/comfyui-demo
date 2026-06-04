import Generator from "@/app/components/Generator";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex w-full max-w-3xl flex-1 flex-col items-center gap-10 px-6 py-16 sm:py-24">
        <header className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-zinc-50">
            ComfyUI 画像生成デモ
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            プロンプトを入力すると、ローカルの ComfyUI（SD1.5）で画像を生成します。
          </p>
        </header>
        <Generator />
      </main>
    </div>
  );
}
