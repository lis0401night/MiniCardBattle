import sharp from 'sharp';

async function main() {
  const charPath = 'scratch/old_char_dragon_school.webp';
  const iconRaw = await sharp('scratch/old_icon_dragon_school.png').raw().toBuffer({ resolveWithObject: true });

  let best = null;
  let minDiff = Infinity;

  // 顔中心付近
  // size は 240 ~ 300
  // left は 250 ~ 350
  // top は 80 ~ 180

  for (let size = 250; size <= 290; size += 2) {
    for (let top = 100; top <= 160; top += 2) {
      for (let left = 270; left <= 330; left += 2) {
        const testImg = await sharp(charPath)
          .extract({ left, top, width: size, height: size })
          .resize(200, 200)
          .raw()
          .toBuffer();

        // 円形内部（中心100, 100, 半径60px以内）のみで比較
        let diff = 0;
        let count = 0;
        for (let y = 50; y < 150; y += 4) {
          for (let x = 50; x < 150; x += 4) {
            const d = Math.sqrt((x - 100) ** 2 + (y - 100) ** 2);
            if (d < 50) {
              const idx = (y * 200 + x) * 4;
              diff += Math.abs(testImg[idx] - iconRaw.data[idx]) +
                      Math.abs(testImg[idx + 1] - iconRaw.data[idx + 1]) +
                      Math.abs(testImg[idx + 2] - iconRaw.data[idx + 2]);
              count++;
            }
          }
        }
        const avg = diff / (count * 3);
        if (avg < minDiff) {
          minDiff = avg;
          best = { left, top, size, diff: avg };
        }
      }
    }
  }

  console.log('Best rough icon crop:', best);

  // 1px単位の精密探索
  const b = best;
  minDiff = Infinity;
  let exactBest = null;

  for (let size = b.size - 3; size <= b.size + 3; size++) {
    for (let top = b.top - 3; top <= b.top + 3; top++) {
      for (let left = b.left - 3; left <= b.left + 3; left++) {
        const testImg = await sharp(charPath)
          .extract({ left, top, width: size, height: size })
          .resize(200, 200)
          .raw()
          .toBuffer();

        let diff = 0;
        let count = 0;
        for (let y = 40; y < 160; y += 2) {
          for (let x = 40; x < 160; x += 2) {
            const d = Math.sqrt((x - 100) ** 2 + (y - 100) ** 2);
            if (d < 60) {
              const idx = (y * 200 + x) * 4;
              diff += Math.abs(testImg[idx] - iconRaw.data[idx]) +
                      Math.abs(testImg[idx + 1] - iconRaw.data[idx + 1]) +
                      Math.abs(testImg[idx + 2] - iconRaw.data[idx + 2]);
              count++;
            }
          }
        }
        const avg = diff / (count * 3);
        if (avg < minDiff) {
          minDiff = avg;
          exactBest = { left, top, size, diff: avg };
        }
      }
    }
  }

  console.log('Absolute Exact Icon Crop:', exactBest);
}

main().catch(console.error);
