import sharp from 'sharp';

async function main() {
  const normalIcon = 'public/assets/icons/icon_cthulhu.webp';
  const summerIcon = 'public/assets/icons/icon_cthulhu_summer.webp';
  const schoolIcon = 'public/assets/icons/icon_cthulhu_school.webp';
  const highIcon = 'public/assets/icons/icon_cthulhu_high.webp';

  const n = await sharp(normalIcon).png().toBuffer();
  const su = await sharp(summerIcon).png().toBuffer();
  const sc = await sharp(schoolIcon).png().toBuffer();
  const h = await sharp(highIcon).png().toBuffer();

  await sharp({
    create: {
      width: 210 * 4 + 10,
      height: 220,
      channels: 4,
      background: { r: 30, g: 30, b: 30, alpha: 1 },
    },
  })
    .composite([
      { input: n, left: 5, top: 10 },
      { input: su, left: 215, top: 10 },
      { input: sc, left: 425, top: 10 },
      { input: h, left: 635, top: 10 },
    ])
    .png()
    .toFile('scratch/cthulhu_four_icons_comparison.png');

  console.log('Saved cthulhu icons comparison');
}

main().catch(console.error);
