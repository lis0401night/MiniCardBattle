import sharp from 'sharp';

async function main() {
  // プレイマット
  await sharp('scratch/old_char_dragon.webp')
    .extract({ left: 47, top: 159, width: 728, height: 364 })
    .resize(400, 200)
    .toFile('scratch/test_board_match.png');

  // アイコン
  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );
  await sharp('scratch/old_char_dragon.webp')
    .extract({ left: 292, top: 155, width: 257, height: 257 })
    .resize(200, 200)
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .toFile('scratch/test_icon_match.png');

  console.log('Saved test matches');
}

main().catch(console.error);
