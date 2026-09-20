import sharp from 'sharp';

async function main() {
  const charPath = 'scratch/old_char_dragon_school.webp';
  const boardImg = await sharp('scratch/old_board_dragon_school.png').removeAlpha().raw().toBuffer({ resolveWithObject: true });

  let bestTop = 0;
  let minDiff = Infinity;

  for (let top = 115; top <= 125; top++) {
    const testImg = await sharp(charPath)
      .extract({ left: 0, top, width: 800, height: 400 })
      .resize(400, 200)
      .removeAlpha()
      .raw()
      .toBuffer();

    let diff = 0;
    const len = 400 * 200 * 3;
    for (let j = 0; j < len; j++) {
      diff += Math.abs(testImg[j] - boardImg.data[j]);
    }
    const avg = diff / len;
    console.log(`Top ${top}: avg diff = ${avg.toFixed(3)}`);
    if (avg < minDiff) {
      minDiff = avg;
      bestTop = top;
    }
  }
  console.log('Exact best top:', bestTop, 'minDiff:', minDiff);
}

main().catch(console.error);
