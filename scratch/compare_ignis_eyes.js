import sharp from 'sharp';

async function main() {
  const normalPath = 'public/assets/characters/char_dragon.webp';
  const summerPath = 'public/assets/characters/char_dragon_summer.webp';
  const schoolPath = 'public/assets/characters/char_dragon_school.webp';

  // 顔周辺（目・表情）をそれぞれクロップして拡大比較
  // normal: 顔は上部中央
  // summer: left: 285, top: 160, size: 257
  // school: 顔の座標を特定するために全体と顔を調べる

  const schoolMeta = await sharp(schoolPath).metadata();
  console.log('School metadata:', schoolMeta);

  // school の顔の位置をクロップ
  // 800x1200 の画像から顔周辺 (250~550, 100~450)
  await sharp(schoolPath)
    .extract({ left: 300, top: 120, width: 250, height: 250 })
    .png()
    .toFile('scratch/school_face_crop.png');

  await sharp(normalPath)
    .extract({ left: 300, top: 180, width: 250, height: 250 })
    .png()
    .toFile('scratch/normal_face_crop.png');

  await sharp(summerPath)
    .extract({ left: 285, top: 160, width: 257, height: 257 })
    .resize(250, 250)
    .png()
    .toFile('scratch/summer_face_crop.png');

  // 横並び比較
  await sharp({
    create: {
      width: 760,
      height: 260,
      channels: 4,
      background: { r: 30, g: 30, b: 30, alpha: 1 },
    },
  })
    .composite([
      { input: 'scratch/normal_face_crop.png', left: 5, top: 5 },
      { input: 'scratch/summer_face_crop.png', left: 255, top: 5 },
      { input: 'scratch/school_face_crop.png', left: 505, top: 5 },
    ])
    .png()
    .toFile('scratch/eyes_compare_three.png');

  console.log('Saved eyes comparison');
}

main().catch(console.error);
