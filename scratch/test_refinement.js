import sharp from 'sharp';

async function main() {
  const opt2Path =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/ignis_school_remake_option2_1789891511192.jpg';

  // 1. 2個目の画像をターゲットサイズ 800x1200 に高品質リサンプルし、
  // ノイズ除去と輪郭鮮鋭化（シャープネス）を最適化して WebP 化してみる
  const refinedBuf = await sharp(opt2Path)
    .resize(800, 1200, {
      kernel: 'lanczos3',
    })
    .sharpen({
      sigma: 1.0,
      m1: 1.2,
      m2: 0.5,
    })
    .webp({ quality: 95, effort: 6 })
    .toBuffer();

  await sharp(refinedBuf).toFile('scratch/ignis_school_opt2_refined.webp');

  // 目元の比較用クロップ
  await sharp('scratch/ignis_school_opt2_refined.webp')
    .extract({ left: 345, top: 165, width: 150, height: 100 })
    .resize(300, 200, { kernel: 'nearest' })
    .png()
    .toFile('scratch/cmp_refined_eye.png');

  // 現行 vs 2個目生 vs 2個目最適化 の横並び
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
      { input: 'scratch/cmp_refined_eye.png', left: 615, top: 5 },
    ])
    .png()
    .toFile('scratch/cmp_refinement_test.png');

  console.log('Saved refinement test');
}

main().catch(console.error);
