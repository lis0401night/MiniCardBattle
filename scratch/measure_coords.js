import sharp from 'sharp';

async function main() {
  const charPath = 'public/assets/characters/char_dragon_summer.webp';

  const crossSvg = Buffer.from(`
    <svg width="200" height="200">
      <circle cx="100" cy="100" r="96" fill="none" stroke="red" stroke-width="2"/>
      <line x1="100" y1="0" x2="100" y2="200" stroke="red" stroke-width="1"/>
      <line x1="0" y1="100" x2="200" y2="100" stroke="red" stroke-width="1"/>
    </svg>
  `);

  const tests = [
    { left: 280, top: 160, size: 257, name: 'L280_T160' },
    { left: 283, top: 160, size: 257, name: 'L283_T160' },
    { left: 285, top: 160, size: 257, name: 'L285_T160' },
    { left: 287, top: 160, size: 257, name: 'L287_T160' },
    { left: 290, top: 160, size: 257, name: 'L290_T160' },
    { left: 285, top: 155, size: 257, name: 'L285_T155' },
    { left: 285, top: 165, size: 257, name: 'L285_T165' },
  ];

  for (const t of tests) {
    await sharp(charPath)
      .extract({ left: t.left, top: t.top, width: t.size, height: t.size })
      .resize(200, 200)
      .composite([{ input: crossSvg }])
      .toFile(`scratch/precise_${t.name}.png`);
  }

  console.log('Saved precise crosshair tests');
}

main().catch(console.error);
