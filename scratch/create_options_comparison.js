import sharp from 'sharp';

async function main() {
  const currentPath = 'public/assets/characters/char_dragon_school.webp';
  const a1Path =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/ignis_school_remake_option2_1789891511192.jpg';
  const a2Path =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/ignis_school_plan_a2_1789893075964.jpg';
  const b1Path =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/ignis_school_plan_b1_1789893113676.jpg';
  const b2Path =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/ignis_school_plan_b2_1789893165734.jpg';

  // 1. 全体像の4枚並び (幅260x高390 にリサイズして横並び: 260*4 + 隙間 = 1070x410)
  const w = 260;
  const h = 390;

  const a1Thumb = await sharp(a1Path).resize(w, h).png().toBuffer();
  const a2Thumb = await sharp(a2Path).resize(w, h).png().toBuffer();
  const b1Thumb = await sharp(b1Path).resize(w, h).png().toBuffer();
  const b2Thumb = await sharp(b2Path).resize(w, h).png().toBuffer();

  await sharp({
    create: {
      width: w * 4 + 25,
      height: h + 20,
      channels: 4,
      background: { r: 25, g: 25, b: 25, alpha: 1 },
    },
  })
    .composite([
      { input: a1Thumb, left: 5, top: 10 },
      { input: a2Thumb, left: w + 10, top: 10 },
      { input: b1Thumb, left: w * 2 + 15, top: 10 },
      { input: b2Thumb, left: w * 3 + 20, top: 10 },
    ])
    .png()
    .toFile('scratch/school_options_four_full.png');

  // 2. 目元・表情の等倍拡大4枚並び (200x150 を 2倍拡大 400x300 で横並び)
  // 顔周辺クロップ
  const getFace = async (p, scale = 1.06) => {
    return sharp(p)
      .extract({
        left: Math.round(345 * scale),
        top: Math.round(155 * scale),
        width: Math.round(160 * scale),
        height: Math.round(120 * scale),
      })
      .resize(260, 195)
      .png()
      .toBuffer();
  };

  const a1Face = await getFace(a1Path, 848 / 800);
  const a2Face = await getFace(a2Path, 848 / 800);
  const b1Face = await getFace(b1Path, 848 / 800);
  const b2Face = await getFace(b2Path, 848 / 800);

  await sharp({
    create: {
      width: 260 * 4 + 25,
      height: 195 + 20,
      channels: 4,
      background: { r: 25, g: 25, b: 25, alpha: 1 },
    },
  })
    .composite([
      { input: a1Face, left: 5, top: 10 },
      { input: a2Face, left: 260 + 10, top: 10 },
      { input: b1Face, left: 260 * 2 + 15, top: 10 },
      { input: b2Face, left: 260 * 3 + 20, top: 10 },
    ])
    .png()
    .toFile('scratch/school_options_four_face.png');

  console.log('Saved 4-options comparison sheets');
}

main().catch(console.error);
