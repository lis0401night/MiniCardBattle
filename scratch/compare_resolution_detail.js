import sharp from 'sharp';

async function main() {
  const normalPath = 'public/assets/characters/char_dragon.webp';
  const summerPath = 'public/assets/characters/char_dragon_summer.webp';
  const schoolOldPath = 'public/assets/characters/char_dragon_school.webp';
  const schoolOpt2Path =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/ignis_school_remake_option2_1789891511192.jpg';

  // 4枚の目元を並べて、通常・水着の高画質レベルと学園の現行・2個目を比較
  // 通常スキン目元
  await sharp(normalPath)
    .extract({ left: 340, top: 220, width: 160, height: 120 })
    .resize(320, 240, { kernel: 'nearest' })
    .png()
    .toFile('scratch/detail_normal_eye.png');

  // 水着スキン目元
  await sharp(summerPath)
    .extract({ left: 320, top: 200, width: 160, height: 120 })
    .resize(320, 240, { kernel: 'nearest' })
    .png()
    .toFile('scratch/detail_summer_eye.png');

  // 学園旧目元
  await sharp(schoolOldPath)
    .extract({ left: 345, top: 165, width: 160, height: 120 })
    .resize(320, 240, { kernel: 'nearest' })
    .png()
    .toFile('scratch/detail_school_old_eye.png');

  // 学園2個目目元 (scale: 848/800 = 1.06, 1264/1200 = 1.053)
  await sharp(schoolOpt2Path)
    .extract({
      left: Math.round(345 * 1.06),
      top: Math.round(165 * 1.053),
      width: Math.round(160 * 1.06),
      height: Math.round(120 * 1.053),
    })
    .resize(320, 240, { kernel: 'nearest' })
    .png()
    .toFile('scratch/detail_school_opt2_eye.png');

  // 4枚並び (660x500)
  await sharp({
    create: {
      width: 660,
      height: 500,
      channels: 4,
      background: { r: 25, g: 25, b: 25, alpha: 1 },
    },
  })
    .composite([
      { input: 'scratch/detail_normal_eye.png', left: 5, top: 5 }, // 左上: 通常
      { input: 'scratch/detail_summer_eye.png', left: 335, top: 5 }, // 右上: 水着
      { input: 'scratch/detail_school_old_eye.png', left: 5, top: 255 }, // 左下: 学園旧
      { input: 'scratch/detail_school_opt2_eye.png', left: 335, top: 255 }, // 右下: 学園2個目
    ])
    .png()
    .toFile('scratch/detail_four_eyes_comparison.png');

  console.log('Saved four eyes detail comparison');
}

main().catch(console.error);
