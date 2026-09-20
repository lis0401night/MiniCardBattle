import sharp from 'sharp';

async function main() {
  const charPath = 'public/assets/characters/char_dragon_summer.webp';
  const normalDest = 'public/assets/icons/icon_dragon_summer.webp';

  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );

  // 1. 正方形のアイコンベース（未マスク）を 200x200 および 1024x1024 で保存
  // 座標: left: 285, top: 160, width: 257, height: 257
  await sharp(charPath)
    .extract({ left: 285, top: 160, width: 257, height: 257 })
    .resize(200, 200)
    .png()
    .toFile('scratch/summer_icon_square_centered.png');

  await sharp(charPath)
    .extract({ left: 285, top: 160, width: 257, height: 257 })
    .resize(1024, 1024, { kernel: 'lanczos3' })
    .png()
    .toFile('scratch/summer_icon_square_1024.png');

  // 2. 正式な通常水着アイコン（円形マスク適用）を保存
  await sharp(charPath)
    .extract({ left: 285, top: 160, width: 257, height: 257 })
    .resize(200, 200)
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .webp({ quality: 90 })
    .toFile(normalDest);

  console.log('Successfully saved centered icon_dragon_summer.webp and base squares');
}

main().catch(console.error);
