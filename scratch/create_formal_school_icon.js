import sharp from 'sharp';

async function main() {
  const charPath = 'public/assets/characters/char_dragon_school.webp';
  const iconDest = 'public/assets/icons/icon_dragon_school.webp';

  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );

  // 1. 正方形アイコン（未マスク）を 1024x1024 で保存（ダメージ表情生成用インプット）
  await sharp(charPath)
    .extract({ left: 288, top: 98, width: 253, height: 253 })
    .resize(1024, 1024, { kernel: 'lanczos3' })
    .png()
    .toFile('scratch/school_icon_square_1024.png');

  // 2. 正式通常学園アイコン (200x200, 円形マスク) を保存
  await sharp(charPath)
    .extract({ left: 288, top: 98, width: 253, height: 253 })
    .resize(200, 200, { kernel: 'lanczos3' })
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .webp({ quality: 90 })
    .toFile(iconDest);

  console.log('Saved formal icon_dragon_school.webp and base 1024 square');
}

main().catch(console.error);
