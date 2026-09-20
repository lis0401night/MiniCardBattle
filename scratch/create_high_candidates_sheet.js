import sharp from 'sharp';

async function main() {
  const schoolPath = 'public/assets/characters/char_cthulhu_school.webp';
  const currentHighPath = 'public/assets/characters/char_cthulhu_high.webp';
  const opt2Path =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_high_remake_opt2_1789895735150.jpg';
  const opt3Path =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_high_remake_opt3_1789895774569.jpg';
  const opt4Path =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/cthulhu_high_remake_opt4_1789895811600.jpg';

  // 1. 全体像の5枚並び
  // [基準: 学園] [現行高難易度] [候補1: 玉座着席] [候補2: 立ち姿A] [候補3: 立ち姿B]
  const w = 240;
  const h = 360;

  const schoolThumb = await sharp(schoolPath).resize(w, h).png().toBuffer();
  const currentThumb = await sharp(currentHighPath).resize(w, h).png().toBuffer();
  const opt2Thumb = await sharp(opt2Path).resize(w, h).png().toBuffer();
  const opt3Thumb = await sharp(opt3Path).resize(w, h).png().toBuffer();
  const opt4Thumb = await sharp(opt4Path).resize(w, h).png().toBuffer();

  await sharp({
    create: {
      width: w * 5 + 30,
      height: h + 20,
      channels: 4,
      background: { r: 25, g: 25, b: 25, alpha: 1 },
    },
  })
    .composite([
      { input: schoolThumb, left: 5, top: 10 },
      { input: currentThumb, left: w + 10, top: 10 },
      { input: opt2Thumb, left: w * 2 + 15, top: 10 },
      { input: opt3Thumb, left: w * 3 + 20, top: 10 },
      { input: opt4Thumb, left: w * 4 + 25, top: 10 },
    ])
    .png()
    .toFile('scratch/cthulhu_high_candidates_full.png');

  // 2. 顔の等倍拡大5枚並び
  const getCrop = async (path, rect, targetSize = 220) => {
    return sharp(path)
      .extract(rect)
      .resize(targetSize, targetSize)
      .png()
      .toBuffer();
  };

  const schoolFace = await getCrop(schoolPath, { left: 300, top: 120, width: 220, height: 220 });
  const currentFace = await getCrop(currentHighPath, { left: 230, top: 320, width: 220, height: 220 });

  // 848x1264 の生成画像からの顔クロップ
  // opt2: left ≈ 320, top ≈ 240, width ≈ 230, height ≈ 230
  const opt2Face = await getCrop(opt2Path, { left: 320, top: 230, width: 220, height: 220 });

  // opt3 (立ち姿): left ≈ 315, top ≈ 140, width ≈ 220, height ≈ 220
  const opt3Face = await getCrop(opt3Path, { left: 315, top: 140, width: 220, height: 220 });

  // opt4 (立ち姿): left ≈ 315, top ≈ 140, width ≈ 220, height ≈ 220
  const opt4Face = await getCrop(opt4Path, { left: 315, top: 140, width: 220, height: 220 });

  await sharp({
    create: {
      width: 220 * 5 + 30,
      height: 220 + 20,
      channels: 4,
      background: { r: 25, g: 25, b: 25, alpha: 1 },
    },
  })
    .composite([
      { input: schoolFace, left: 5, top: 10 },
      { input: currentFace, left: 220 + 10, top: 10 },
      { input: opt2Face, left: 220 * 2 + 15, top: 10 },
      { input: opt3Face, left: 220 * 3 + 20, top: 10 },
      { input: opt4Face, left: 220 * 4 + 25, top: 10 },
    ])
    .png()
    .toFile('scratch/cthulhu_high_candidates_face.png');

  console.log('Saved high Cthulhu candidates comparison sheets');
}

main().catch(console.error);
