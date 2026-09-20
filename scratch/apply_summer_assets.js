import sharp from 'sharp';

async function main() {
  const newSummerSrc =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/char_dragon_summer_masterpiece_v2_1789887246469.jpg';

  const charDest = 'public/assets/characters/char_dragon_summer.webp';
  const boardDest = 'public/assets/boards/board_dragon_summer.webp';
  const iconDest = 'public/assets/icons/icon_dragon_summer.webp';

  // 1. 水着立ち絵 (800x1200, WebP)
  await sharp(newSummerSrc)
    .resize(800, 1200, { fit: 'cover' })
    .webp({ quality: 90 })
    .toFile(charDest);
  console.log('Saved char_dragon_summer.webp successfully');

  // 2. 水着プレイマット (left: 72, top: 172, width: 710, height: 355 -> 400x200)
  await sharp(charDest)
    .extract({ left: 72, top: 172, width: 710, height: 355 })
    .resize(400, 200)
    .webp({ quality: 90 })
    .toFile(boardDest);
  console.log('Saved board_dragon_summer.webp successfully');

  // 3. 水着通常アイコン (left: 295, top: 172, width: 259, height: 259 -> 200x200 + 円形マスク)
  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );
  await sharp(charDest)
    .extract({ left: 295, top: 172, width: 259, height: 259 })
    .resize(200, 200)
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .webp({ quality: 90 })
    .toFile(iconDest);
  console.log('Saved icon_dragon_summer.webp successfully');
}

main().catch(console.error);
