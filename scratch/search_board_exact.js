import sharp from 'sharp';

async function main() {
  const charPath = 'scratch/old_char_dragon_school.webp';
  const boardImg = await sharp('scratch/old_board_dragon_school.png').removeAlpha().raw().toBuffer({ resolveWithObject: true });

  let best = null;
  let minDiff = Infinity;

  for (let top = 117; top <= 119; top++) {
    for (let w = 796; w <= 800; w++) {
      const h = Math.round(w / 2);
      for (let left = 0; left <= 800 - w; left++) {
        const testImg = await sharp(charPath)
          .extract({ left, top, width: w, height: h })
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
        if (avg < minDiff) {
          minDiff = avg;
          best = { left, top, width: w, height: h, diff: avg };
        }
      }
    }
  }
  console.log('Absolute Exact Board Crop:', best);
}

main().catch(console.error);
