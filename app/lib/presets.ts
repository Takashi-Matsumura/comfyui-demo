// 「操作マニュアル」向けのサンプルプロンプト集。
// Generator.tsx のプリセットボタンから参照し、ポジティブ/ネガティブ欄へ流し込む。
//
// 注意: SD1.5 は文字描画やリアルな UI 再現が苦手なため、
// いずれも「文字なしの図解・アイコン・イラスト」方向に寄せている。

export interface PromptPreset {
  // ボタンに表示する短いラベル
  label: string;
  // 何を狙ったプリセットかの一言説明
  description: string;
  // ポジティブプロンプト
  prompt: string;
  // ネガティブプロンプト（マニュアル系で共通して効くものを個別に持たせる）
  negativePrompt: string;
}

// マニュアル系で共通して避けたい要素。各プリセットの negativePrompt のベースに使う。
const MANUAL_NEGATIVE =
  "text, words, letters, watermark, signature, blurry, lowres, jpeg artifacts, " +
  "deformed, distorted, messy, cluttered, photorealistic, realistic photo";

export const MANUAL_PRESETS: PromptPreset[] = [
  {
    label: "フラットアイコン図解",
    description: "白背景・線画ベースのシンプルな手順アイコン",
    prompt:
      "flat design instructional icon, simple line illustration, step-by-step guide, " +
      "minimal vector style, clean white background, soft pastel colors, centered composition",
    negativePrompt: MANUAL_NEGATIVE + ", gradient, 3d render, shadow, complex details",
  },
  {
    label: "UIスクリーンショット風",
    description: "ダッシュボード/アプリ画面のモックアップ風",
    prompt:
      "clean software UI mockup, dashboard interface, buttons panels and cards, " +
      "flat design, web app layout, modern minimal style, light theme, neat grid composition",
    negativePrompt: MANUAL_NEGATIVE + ", handwriting, sketch, paper texture",
  },
  {
    label: "手順イラスト（手元）",
    description: "デバイスを操作する手元のトップダウン図",
    prompt:
      "instructional illustration, hands operating a device, top-down flat lay view, " +
      "clear simple shapes, manual diagram style, flat colors, white background, easy to understand",
    negativePrompt: MANUAL_NEGATIVE + ", face, full body, dramatic lighting",
  },
  {
    label: "注意書きピクトグラム",
    description: "安全標識のような高コントラストのアイコン",
    prompt:
      "warning pictogram, safety sign, bold simple icon, high contrast, " +
      "yellow and black, isolated on white background, flat vector symbol, clear silhouette",
    negativePrompt: MANUAL_NEGATIVE + ", gradient, realistic, texture, small details",
  },
  {
    label: "等角図（アイソメ）",
    description: "デバイスの分解図風アイソメトリック",
    prompt:
      "isometric illustration, 3d technical diagram, exploded view of a device, " +
      "manual style, clean flat colors, soft shadows, light background, organized layout",
    negativePrompt: MANUAL_NEGATIVE + ", flat 2d, top view, photo",
  },
];
