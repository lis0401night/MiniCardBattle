import sharp from 'sharp';

async function main() {
  const newChar = 'public/assets/characters/char_dragon.webp';
  const boardDest = 'public/assets/boards/board_dragon.webp';
  const iconDest = 'public/assets/icons/icon_dragon.webp';

  // 1. プレイマット: left: 47, top: 159, width: 728, height: 364 -> resize(400, 200)
  await sharp(newChar)
    .extract({ left: 47, top: 159, width: 728, height: 364 })
    .resize(400, 200)
    .webp({ quality: 90 })
    .toFile(boardDest);
  console.log('Saved board_dragon.webp at exact matching coordinates');

  // 2. アイコン: left: 292, top: 155, width: 257, height: 257 -> resize(200, 200) + circle mask
  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );
  await sharp(newChar)
    .extract({ left: 292, top: 155, width: 257, height: 257 })
    .resize(200, 200)
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .webp({ quality: 90 })
    .toFile(iconDest);
  console.log('Saved icon_dragon.webp at exact matching coordinates');
}

main().catch(console.error);
