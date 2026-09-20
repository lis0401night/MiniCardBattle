import sharp from 'sharp';

async function main() {
  const charPath = 'public/assets/characters/char_dragon_summer.webp';
  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );

  const tests = [
    { name: 'p1', left: 270, top: 150, size: 285 },
    { name: 'p2', left: 265, top: 145, size: 290 },
    { name: 'p3', left: 260, top: 150, size: 285 },
  ];

  for (const t of tests) {
    await sharp(charPath)
      .extract({ left: t.left, top: t.top, width: t.size, height: t.size })
      .resize(200, 200)
      .composite([{ input: circleSvg, blend: 'dest-in' }])
      .toFile(`scratch/summer_icon_${t.name}.png`);
  }

  console.log('Saved perfect tests');
}

main().catch(console.error);
