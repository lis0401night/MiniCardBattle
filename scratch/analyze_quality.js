import sharp from 'sharp';

async function main() {
  const oldPath = 'public/assets/characters/char_dragon_school.webp';
  const newPath =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/ignis_school_remake_option2_1789891511192.jpg';

  const oldMeta = await sharp(oldPath).metadata();
  const newMeta = await sharp(newPath).metadata();

  console.log('Old image metadata:', oldMeta);
  console.log('New image metadata:', newMeta);

  // 新旧の同じ部位（顔・目元、ギターの炎パターン）を等倍で切り出して横並びに配置し、画質の鮮明さを客観的に比較する
  // 旧画像: 800x1200
  // 新画像: メタデータで確認（おそらく 800x1200 以上の高解像度、または 896x1344 / 1024x1536 等）

  // まず新画像を 800x1200 に合わせた場合と、等倍（ピクセル100%）の両方で比較できるようにする
  // 顔の等倍切り出し (200x200)
  // 旧画像
  await sharp(oldPath)
    .extract({ left: 340, top: 140, width: 200, height: 200 })
    .png()
    .toFile('scratch/quality_old_face_crop.png');

  // 新画像の顔座標を調べるため、新画像メタデータと比率を計算
  const scaleX = newMeta.width / oldMeta.width;
  const scaleY = newMeta.height / oldMeta.height;

  await sharp(newPath)
    .extract({
      left: Math.round(340 * scaleX),
      top: Math.round(140 * scaleY),
      width: Math.round(200 * scaleX),
      height: Math.round(200 * scaleY),
    })
    .resize(200, 200)
    .png()
    .toFile('scratch/quality_new_face_crop_matched.png');

  // さらに2倍拡大（ズーム）して、線のディテールやノイズの違いを可視化する
  await sharp('scratch/quality_old_face_crop.png')
    .resize(400, 400, { kernel: 'nearest' })
    .png()
    .toFile('scratch/quality_old_face_zoom2x.png');

  await sharp('scratch/quality_new_face_crop_matched.png')
    .resize(400, 400, { kernel: 'nearest' })
    .png()
    .toFile('scratch/quality_new_face_zoom2x.png');

  // 比較画像を作成（左: 現行, 右: 新2個目）
  await sharp({
    create: {
      width: 820,
      height: 420,
      channels: 4,
      background: { r: 30, g: 30, b: 30, alpha: 1 },
    },
  })
    .composite([
      { input: 'scratch/quality_old_face_zoom2x.png', left: 10, top: 10 },
      { input: 'scratch/quality_new_face_zoom2x.png', left: 420, top: 10 },
    ])
    .png()
    .toFile('scratch/quality_face_comparison_zoom.png');

  console.log('Saved quality comparison image');
}

main().catch(console.error);
