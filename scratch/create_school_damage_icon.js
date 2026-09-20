import sharp from 'sharp';

async function main() {
  const genDamagePath =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/icon_dragon_school_damage_gen_1789894689023.jpg';
  const normalIconPath = 'public/assets/icons/icon_dragon_school.webp';
  const damageIconDest = 'public/assets/icons/icon_dragon_school_damage.webp';

  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );

  // 1. ダメージアイコンを保存
  await sharp(genDamagePath)
    .resize(200, 200, { kernel: 'lanczos3' })
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .webp({ quality: 90 })
    .toFile(damageIconDest);

  console.log('Saved icon_dragon_school_damage.webp');

  // 2. 十字線比較画像
  const crossSvg = Buffer.from(`
    <svg width="200" height="200">
      <circle cx="100" cy="100" r="96" fill="none" stroke="red" stroke-width="2"/>
      <line x1="100" y1="0" x2="100" y2="200" stroke="red" stroke-width="1"/>
      <line x1="0" y1="100" x2="200" y2="100" stroke="red" stroke-width="1"/>
    </svg>
  `);

  await sharp(normalIconPath)
    .composite([{ input: crossSvg }])
    .toFile('scratch/school_normal_cross.png');

  await sharp(damageIconDest)
    .composite([{ input: crossSvg }])
    .toFile('scratch/school_damage_cross.png');

  // 3. 横並び比較 (420x210)
  await sharp({
    create: {
      width: 420,
      height: 210,
      channels: 4,
      background: { r: 30, g: 30, b: 30, alpha: 1 },
    },
  })
    .composite([
      { input: await sharp(normalIconPath).png().toBuffer(), left: 5, top: 5 },
      { input: await sharp(damageIconDest).png().toBuffer(), left: 215, top: 5 },
    ])
    .png()
    .toFile('scratch/school_final_side_by_side.png');

  // 4. 十字線付き横並び (420x210)
  await sharp({
    create: {
      width: 420,
      height: 210,
      channels: 4,
      background: { r: 30, g: 30, b: 30, alpha: 1 },
    },
  })
    .composite([
      { input: 'scratch/school_normal_cross.png', left: 5, top: 5 },
      { input: 'scratch/school_damage_cross.png', left: 215, top: 5 },
    ])
    .png()
    .toFile('scratch/school_final_cross_side_by_side.png');

  // 5. 50:50 重ね合わせによる二重線・位置ズレ検査
  const nRaw = await sharp(normalIconPath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const dRaw = await sharp(damageIconDest).removeAlpha().raw().toBuffer({ resolveWithObject: true });

  const overlayBuf = Buffer.alloc(200 * 200 * 4);
  for (let i = 0; i < 200 * 200; i++) {
    const i4 = i * 4;
    const i3 = i * 3;
    overlayBuf[i4] = Math.round(nRaw.data[i3] * 0.5 + dRaw.data[i3] * 0.5);
    overlayBuf[i4 + 1] = Math.round(nRaw.data[i3 + 1] * 0.5 + dRaw.data[i3 + 1] * 0.5);
    overlayBuf[i4 + 2] = Math.round(nRaw.data[i3 + 2] * 0.5 + dRaw.data[i3 + 2] * 0.5);
    overlayBuf[i4 + 3] = 255;
  }

  await sharp(overlayBuf, { raw: { width: 200, height: 200, channels: 4 } })
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .png()
    .toFile('scratch/school_damage_overlay_50_50.png');

  console.log('Saved all validation images');
}

main().catch(console.error);
