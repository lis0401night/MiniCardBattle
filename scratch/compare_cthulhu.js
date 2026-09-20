import sharp from 'sharp';

async function main() {
  const normalPath = 'public/assets/characters/char_cthulhu.webp';
  const summerPath = 'public/assets/characters/char_cthulhu_summer.webp';
  const schoolPath = 'public/assets/characters/char_cthulhu_school.webp';
  const highPath = 'public/assets/characters/char_cthulhu_high.webp';

  // 1. 全体像の4枚並び (幅260x高390)
  const w = 260;
  const h = 390;

  const normalThumb = await sharp(normalPath).resize(w, h).png().toBuffer();
  const summerThumb = await sharp(summerPath).resize(w, h).png().toBuffer();
  const schoolThumb = await sharp(schoolPath).resize(w, h).png().toBuffer();
  const highThumb = await sharp(highPath).resize(w, h).png().toBuffer();

  await sharp({
    create: {
      width: w * 4 + 25,
      height: h + 20,
      channels: 4,
      background: { r: 25, g: 25, b: 25, alpha: 1 },
    },
  })
    .composite([
      { input: normalThumb, left: 5, top: 10 },
      { input: summerThumb, left: w + 10, top: 10 },
      { input: schoolThumb, left: w * 2 + 15, top: 10 },
      { input: highThumb, left: w * 3 + 20, top: 10 },
    ])
    .png()
    .toFile('scratch/cthulhu_four_full.png');

  // 2. 顔の等倍切り出し (250x250 を横並び)
  // 各立ち絵におけるナイアの顔の位置を調べる
  // normal: 顔は中央上部 (x: 275~525, y: 120~370)
  // summer: 顔は中央上部 (x: 275~525, y: 140~390)
  // school: 顔は中央上部 (x: 275~525, y: 100~350)
  // high: 顔は中央上部 (x: 230~480, y: 300~550 付近？玉座に座っているので位置が低い！)

  const normalFace = await sharp(normalPath)
    .extract({ left: 300, top: 150, width: 220, height: 220 })
    .resize(250, 250)
    .png()
    .toBuffer();

  const summerFace = await sharp(summerPath)
    .extract({ left: 320, top: 180, width: 220, height: 220 })
    .resize(250, 250)
    .png()
    .toBuffer();

  const schoolFace = await sharp(schoolPath)
    .extract({ left: 300, top: 120, width: 220, height: 220 })
    .resize(250, 250)
    .png()
    .toBuffer();

  // high の顔位置を調べるために少し広めに
  const highFace = await sharp(highPath)
    .extract({ left: 230, top: 320, width: 220, height: 220 })
    .resize(250, 250)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: 250 * 4 + 25,
      height: 250 + 20,
      channels: 4,
      background: { r: 25, g: 25, b: 25, alpha: 1 },
    },
  })
    .composite([
      { input: normalFace, left: 5, top: 10 },
      { input: summerFace, left: 250 + 10, top: 10 },
      { input: schoolFace, left: 250 * 2 + 15, top: 10 },
      { input: highFace, left: 250 * 3 + 20, top: 10 },
    ])
    .png()
    .toFile('scratch/cthulhu_four_face.png');

  console.log('Saved cthulhu comparison sheets');
}

main().catch(console.error);
