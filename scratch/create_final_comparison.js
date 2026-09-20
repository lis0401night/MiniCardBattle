import sharp from 'sharp';
import fs from 'fs';

async function main() {
  const normalPath = 'public/assets/icons/icon_dragon_summer.webp';
  const damagePath = 'scratch/summer_damage_candidate_A.webp';

  const crossSvg = Buffer.from(`
    <svg width="200" height="200">
      <circle cx="100" cy="100" r="96" fill="none" stroke="red" stroke-width="2"/>
      <line x1="100" y1="0" x2="100" y2="200" stroke="red" stroke-width="1"/>
      <line x1="0" y1="100" x2="200" y2="100" stroke="red" stroke-width="1"/>
    </svg>
  `);

  await sharp(normalPath)
    .composite([{ input: crossSvg }])
    .toFile('scratch/final_normal_cross.png');

  await sharp(damagePath)
    .composite([{ input: crossSvg }])
    .toFile('scratch/final_damage_cross.png');

  // 横並び比較画像 (400x200)
  await sharp({
    create: {
      width: 420,
      height: 210,
      channels: 4,
      background: { r: 30, g: 30, b: 30, alpha: 1 },
    },
  })
    .composite([
      { input: await sharp(normalPath).png().toBuffer(), left: 5, top: 5 },
      { input: await sharp(damagePath).png().toBuffer(), left: 215, top: 5 },
    ])
    .png()
    .toFile('scratch/final_side_by_side.png');

  // 十字線付き横並び (420x210)
  await sharp({
    create: {
      width: 420,
      height: 210,
      channels: 4,
      background: { r: 30, g: 30, b: 30, alpha: 1 },
    },
  })
    .composite([
      { input: await sharp('scratch/final_normal_cross.png').png().toBuffer(), left: 5, top: 5 },
      { input: await sharp('scratch/final_damage_cross.png').png().toBuffer(), left: 215, top: 5 },
    ])
    .png()
    .toFile('scratch/final_cross_side_by_side.png');

  console.log('Saved final comparison images');
}

main().catch(console.error);
