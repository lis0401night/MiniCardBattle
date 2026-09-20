import sharp from 'sharp';

async function main() {
  const oldPath = 'public/assets/characters/char_dragon_school.webp';
  const opt2Path =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/ignis_school_remake_option2_1789891511192.jpg';
  const uhdPath =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/ignis_school_ultra_hd_1789891802777.jpg';

  // 3枚の目元 (300x200)
  await sharp(oldPath)
    .extract({ left: 345, top: 165, width: 150, height: 100 })
    .resize(300, 200, { kernel: 'nearest' })
    .png()
    .toFile('scratch/cmp_old_eye.png');

  await sharp(opt2Path)
    .extract({
      left: Math.round(345 * 1.06),
      top: Math.round(165 * 1.053),
      width: Math.round(150 * 1.06),
      height: Math.round(100 * 1.053),
    })
    .resize(300, 200, { kernel: 'nearest' })
    .png()
    .toFile('scratch/cmp_opt2_eye.png');

  await sharp(uhdPath)
    .extract({
      left: Math.round(345 * 1.06),
      top: Math.round(165 * 1.053),
      width: Math.round(150 * 1.06),
      height: Math.round(100 * 1.053),
    })
    .resize(300, 200, { kernel: 'nearest' })
    .png()
    .toFile('scratch/cmp_uhd_eye.png');

  // 横並び (920x210)
  await sharp({
    create: {
      width: 920,
      height: 210,
      channels: 4,
      background: { r: 30, g: 30, b: 30, alpha: 1 },
    },
  })
    .composite([
      { input: 'scratch/cmp_old_eye.png', left: 5, top: 5 },
      { input: 'scratch/cmp_opt2_eye.png', left: 310, top: 5 },
      { input: 'scratch/cmp_uhd_eye.png', left: 615, top: 5 },
    ])
    .png()
    .toFile('scratch/cmp_three_eyes.png');

  console.log('Saved three eyes comparison');
}

main().catch(console.error);
