import sharp from 'sharp';

async function main() {
  const b1Source =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/ignis_school_plan_b1_1789893113676.jpg';

  const charDest = 'public/assets/characters/char_dragon_school.webp';
  const boardDest = 'public/assets/boards/board_dragon_school.webp';

  // 1. 新立ち絵 (800x1200, WebP quality 90) を生成・配置
  await sharp(b1Source)
    .resize(800, 1200, { kernel: 'lanczos3' })
    .webp({ quality: 90 })
    .toFile(charDest);
  console.log('Saved char_dragon_school.webp');

  // 2. プレイマット (left: 0, top: 118, width: 800, height: 400 -> 400x200) を生成・配置
  await sharp(charDest)
    .extract({ left: 0, top: 118, width: 800, height: 400 })
    .resize(400, 200, { kernel: 'lanczos3' })
    .webp({ quality: 90 })
    .toFile(boardDest);
  console.log('Saved board_dragon_school.webp');

  // 3. アイコンの中心十字線テスト (left: 285~295, top: 95~105, size: 253)
  const crossSvg = Buffer.from(`
    <svg width="200" height="200">
      <circle cx="100" cy="100" r="96" fill="none" stroke="red" stroke-width="2"/>
      <line x1="100" y1="0" x2="100" y2="200" stroke="red" stroke-width="1"/>
      <line x1="0" y1="100" x2="200" y2="100" stroke="red" stroke-width="1"/>
    </svg>
  `);

  const tests = [
    { left: 285, top: 98, size: 253 },
    { left: 288, top: 98, size: 253 },
    { left: 292, top: 98, size: 253 },
    { left: 295, top: 98, size: 253 },
    { left: 292, top: 102, size: 253 },
  ];

  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    await sharp(charDest)
      .extract({ left: t.left, top: t.top, width: t.size, height: t.size })
      .resize(200, 200)
      .composite([{ input: crossSvg }])
      .png()
      .toFile(`scratch/school_icon_cross_${i}_L${t.left}_T${t.top}.png`);
  }

  console.log('Saved icon crosshair tests');
}

main().catch(console.error);
