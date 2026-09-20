import sharp from 'sharp';

async function main() {
  const charPath = 'public/assets/characters/char_dragon_summer.webp';
  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );

  // 通常アイコンと同じ拡大率（size = 257）で、中央寄せの left, top を探索
  const crops = [
    { name: 'z1', left: 280, top: 160, size: 257 },
    { name: 'z2', left: 285, top: 165, size: 257 },
    { name: 'z3', left: 275, top: 165, size: 257 },
    { name: 'z4', left: 275, top: 160, size: 257 },
    { name: 'z5', left: 270, top: 155, size: 257 },
  ];

  for (const c of crops) {
    await sharp(charPath)
      .extract({ left: c.left, top: c.top, width: c.size, height: c.size })
      .resize(200, 200)
      .composite([{ input: circleSvg, blend: 'dest-in' }])
      .toFile(`scratch/zoom_${c.name}.png`);
  }

  console.log('Saved zoom tests');
}

main().catch(console.error);
