import sharp from 'sharp';

async function main() {
  const schoolPath = 'public/assets/characters/char_dragon_school.webp';
  const width = 800;
  const height = 1200;

  // 1. 現行画像のピクセルデータを取得
  const imgRaw = await sharp(schoolPath)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 目の座標範囲を特定して、瞳の黄緑色をエメラルドグリーン（青緑）に置き換える
  // 顔の範囲: x: 340~460, y: 180~270
  // 左目: x ≈ 370~395, y ≈ 205~225
  // 右目: x ≈ 410~435, y ≈ 190~215

  const buf = Buffer.from(imgRaw.data);

  // 通常スキンのエメラルドグリーン:
  // R: 30~80, G: 200~255, B: 140~200 (青緑系)
  // 現行学園スキンの黄緑:
  // R: 120~180, G: 190~240, B: 40~90 (黄色が強い)

  for (let y = 180; y < 240; y++) {
    for (let x = 360; x < 450; x++) {
      const idx = (y * width + x) * 4;
      const r = buf[idx];
      const g = buf[idx + 1];
      const b = buf[idx + 2];

      // 瞳の緑色判定 (Gが高く、RとBが低め〜中程度)
      // 黄緑: R > B * 1.5, G > 120
      if (g > 100 && g > r * 0.9 && r > b) {
        // 黄色味 (R) を減らし、青味 (B) を増やしてエメラルドグリーンへシフト
        // 目標: 鮮烈な青緑 (Emerald Green)
        const intensity = g / 255;
        const newR = Math.round(r * 0.35 + 10);
        const newG = Math.min(255, Math.round(g * 1.1 + 15));
        const newB = Math.min(255, Math.round(b * 1.8 + g * 0.45));

        buf[idx] = newR;
        buf[idx + 1] = newG;
        buf[idx + 2] = newB;
      }
    }
  }

  // シャープネスをかけて保存
  await sharp(buf, { raw: { width, height, channels: 4 } })
    .sharpen({ sigma: 1.2, m1: 1.5, m2: 0.7 })
    .webp({ quality: 95 })
    .toFile('scratch/school_color_adjusted.webp');

  // 顔のクロップを保存して確認
  await sharp('scratch/school_color_adjusted.webp')
    .extract({ left: 300, top: 120, width: 250, height: 250 })
    .png()
    .toFile('scratch/school_color_adjusted_face.png');

  console.log('Saved color adjusted school image');
}

main().catch(console.error);
