import sharp from 'sharp';

async function main() {
  // 1. プレイマット検証
  await sharp('scratch/old_char_dragon_summer.webp')
    .extract({ left: 72, top: 172, width: 710, height: 355 })
    .resize(400, 200)
    .toFile('scratch/test_summer_board_match.png');

  // 2. アイコン検証
  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );
  await sharp('scratch/old_char_dragon_summer.webp')
    .extract({ left: 295, top: 172, width: 259, height: 259 })
    .resize(200, 200)
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .toFile('scratch/test_summer_icon_match.png');

  console.log('Saved test summer matches');
}

main().catch(console.error);
