import sharp from 'sharp';

async function main() {
  const charRaw = await sharp('scratch/old_char_dragon_school.webp').raw().toBuffer({ resolveWithObject: true });
  const boardRaw = await sharp('scratch/old_board_dragon_school.png').raw().toBuffer({ resolveWithObject: true });

  // プレイマットのサイズ: 400x200
  // 立ち絵: 800x1200
  // 切り出し比率: 幅 W, 高さ W/2
  // W の候補: 700 ~ 800
  // top の候補: 0 ~ 150
  // left の候補: 0 ~ 800 - W

  let minDiff = Infinity;
  let best = null;

  for (let w = 740; w <= 800; w += 2) {
    const h = Math.round(w / 2);
    for (let top = 0; top <= 80; top += 2) {
      for (let left = 0; left <= 800 - w; left += 2) {
        const test = await sharp('scratch/old_char_dragon_school.webp')
          .extract({ left, top, width: w, height: h })
          .resize(400, 200)
          .raw()
          .toBuffer();

        // 差分計算
        let diff = 0;
        for (let i = 0; i < 400 * 200 * 4; i += 40) {
          const d = Math.abs(test[i] - boardRaw.data[i]) +
                    Math.abs(test[i + 1] - boardRaw.data[i + 1]) +
                    Math.abs(test[i + 2] - boardRaw.data[i + 2]);
          diff += d;
        }

        if (diff < minDiff) {
          minDiff = diff;
          best = { left, top, width: w, height: h };
        }
      }
    }
  }

  console.log('Exact Board Crop:', best, 'minDiff:', minDiff);
}

main().catch(console.error);
