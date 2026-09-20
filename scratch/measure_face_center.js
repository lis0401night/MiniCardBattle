import sharp from 'sharp';

async function main() {
  const charPath = 'public/assets/characters/char_dragon_summer.webp';

  // 1. 通常立ち絵のアイコン（icon_dragon.webp）の顔の中心位置を測る
  // 通常アイコンの中心 (100, 100) に十字線を描いてみる
  const crossSvg = Buffer.from(`
    <svg width="200" height="200">
      <circle cx="100" cy="100" r="96" fill="none" stroke="red" stroke-width="2"/>
      <line x1="100" y1="0" x2="100" y2="200" stroke="red" stroke-width="1"/>
      <line x1="0" y1="100" x2="200" y2="100" stroke="red" stroke-width="1"/>
    </svg>
  `);

  await sharp('public/assets/icons/icon_dragon.webp')
    .composite([{ input: crossSvg }])
    .toFile('scratch/normal_icon_crosshair.png');

  // 2. 水着立ち絵から、left を 280, 285, 290, 295, 300 で切り出して十字線を重ねる
  // 顔（鼻筋・唇）が X=100 の縦線にぴったり来る left はどれかを調べる！
  const testLefts = [275, 280, 285, 290, 295, 300];
  for (const left of testLefts) {
    await sharp(charPath)
      .extract({ left, top: 160, width: 257, height: 257 })
      .resize(200, 200)
      .composite([{ input: crossSvg }])
      .toFile(`scratch/summer_cross_${left}.png`);
  }

  console.log('Saved crosshair tests');
}

main().catch(console.error);
