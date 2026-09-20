import sharp from 'sharp';

async function main() {
  const charPath = 'scratch/old_char_dragon_school.webp';

  // top: 50, 60, 70, 80, 90, 100 で 800x400 を切り出して 400x200 にリサイズ
  for (const top of [50, 60, 70, 80, 90, 100]) {
    await sharp(charPath)
      .extract({ left: 0, top, width: 800, height: 400 })
      .resize(400, 200)
      .png()
      .toFile(`scratch/board_h400_top${top}.png`);
  }

  // 差分計算
  const boardImg = await sharp('scratch/old_board_dragon_school.png').removeAlpha().raw().toBuffer({ resolveWithObject: true });

  for (const top of [50, 60, 70, 80, 90, 100]) {
    const testImg = await sharp(`scratch/board_h400_top${top}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let diff = 0;
    const len = 400 * 200 * 3;
    for (let j = 0; j < len; j++) {
      diff += Math.abs(testImg.data[j] - boardImg.data[j]);
    }
    const avg = diff / len;
    console.log(`Top ${top}: avg diff = ${avg.toFixed(2)}`);
  }
}

main().catch(console.error);
