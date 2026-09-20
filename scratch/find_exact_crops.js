import sharp from 'sharp';

async function main() {
  const charImg = sharp('scratch/old_char_dragon.webp');
  const boardImg = sharp('scratch/old_board_dragon.webp');
  const iconImg = sharp('scratch/old_icon_dragon.webp');

  const charRaw = await charImg.raw().toBuffer({ resolveWithObject: true });
  const boardRaw = await boardImg.raw().toBuffer({ resolveWithObject: true });
  const iconRaw = await iconImg.raw().toBuffer({ resolveWithObject: true });

  console.log('--- プレイマットの調査 ---');
  // board_dragon.webp (400x200) の特徴的なパッチ（例えば中心付近の 60x60）を char_dragon.webp 内で探索
  // board_dragon の (170, 70, 60, 60)
  const patchW = 40;
  const patchH = 40;
  const boardPatchX = 180;
  const boardPatchY = 80;

  // board_dragon と char_dragon のスケール比 s を調べる
  // board が char から切り抜かれて resize(400, 200) されたとする。
  // 切り抜き幅 W_crop、高さ H_crop = W_crop / 2
  // スケール factor = 400 / W_crop
  // つまり W_crop は 400 から 800 の間。
  // まず、幾つかの W_crop で試して最良のスケールと位置を探す

  let bestBoard = null;
  let minBoardDiff = Infinity;

  for (let wCrop = 400; wCrop <= 800; wCrop += 10) {
    const hCrop = Math.round(wCrop / 2);
    const maxLeft = 800 - wCrop;
    const maxTop = 1200 - hCrop;

    for (let top = 0; top <= Math.min(maxTop, 600); top += 10) {
      for (let left = 0; left <= maxLeft; left += 10) {
        const resized = await sharp('scratch/old_char_dragon.webp')
          .extract({ left, top, width: wCrop, height: hCrop })
          .resize(400, 200)
          .raw()
          .toBuffer();

        let diff = 0;
        for (let i = 0; i < resized.length; i += 30) {
          const d = resized[i] - boardRaw.data[i];
          diff += d * d;
        }

        if (diff < minBoardDiff) {
          minBoardDiff = diff;
          bestBoard = { left, top, wCrop, hCrop, diff };
        }
      }
    }
  }

  console.log('粗探索 Best Board:', bestBoard);

  // 粗探索の周辺を 1px 単位で精密探索
  let refineBoard = bestBoard;
  let minRefineDiff = Infinity;
  for (let wCrop = bestBoard.wCrop - 15; wCrop <= bestBoard.wCrop + 15; wCrop++) {
    const hCrop = Math.round(wCrop / 2);
    for (let top = Math.max(0, bestBoard.top - 15); top <= bestBoard.top + 15; top++) {
      for (let left = Math.max(0, bestBoard.left - 15); left <= Math.min(800 - wCrop, bestBoard.left + 15); left++) {
        const resized = await sharp('scratch/old_char_dragon.webp')
          .extract({ left, top, width: wCrop, height: hCrop })
          .resize(400, 200)
          .raw()
          .toBuffer();

        let diff = 0;
        for (let i = 0; i < resized.length; i += 12) {
          const d = resized[i] - boardRaw.data[i];
          diff += d * d;
        }

        if (diff < minRefineDiff) {
          minRefineDiff = diff;
          refineBoard = { left, top, width: wCrop, height: hCrop, diff };
        }
      }
    }
  }
  console.log('精密探索 精密 Board:', refineBoard);

  console.log('--- アイコンの調査 ---');
  // icon_dragon.webp (200x200, 円形マスク付き)
  // 円の内側 (x-100)^2 + (y-100)^2 <= 85^2 のピクセルだけで差分比較
  let bestIcon = null;
  let minIconDiff = Infinity;

  // アイコン切り抜きサイズ S_crop (180〜400)
  for (let sCrop = 200; sCrop <= 360; sCrop += 10) {
    for (let top = 100; top <= 350; top += 10) {
      for (let left = 240; left <= 450; left += 10) {
        if (left + sCrop > 800 || top + sCrop > 1200) continue;

        const resized = await sharp('scratch/old_char_dragon.webp')
          .extract({ left, top, width: sCrop, height: sCrop })
          .resize(200, 200)
          .raw()
          .toBuffer();

        let diff = 0;
        let count = 0;
        for (let y = 30; y < 170; y += 4) {
          for (let x = 30; x < 170; x += 4) {
            const dx = x - 100;
            const dy = y - 100;
            if (dx * dx + dy * dy < 70 * 70) {
              const idx = (y * 200 + x) * 4;
              const rIdx = (y * 200 + x) * 3;
              const dr = resized[rIdx] - iconRaw.data[idx];
              const dg = resized[rIdx + 1] - iconRaw.data[idx + 1];
              const db = resized[rIdx + 2] - iconRaw.data[idx + 2];
              diff += dr * dr + dg * dg + db * db;
              count++;
            }
          }
        }

        const avgDiff = diff / count;
        if (avgDiff < minIconDiff) {
          minIconDiff = avgDiff;
          bestIcon = { left, top, size: sCrop, avgDiff };
        }
      }
    }
  }
  console.log('粗探索 Best Icon:', bestIcon);

  // アイコンの精密探索
  let refineIcon = bestIcon;
  let minRefineIconDiff = Infinity;
  for (let sCrop = bestIcon.size - 10; sCrop <= bestIcon.size + 10; sCrop++) {
    for (let top = bestIcon.top - 10; top <= bestIcon.top + 10; top++) {
      for (let left = bestIcon.left - 10; left <= bestIcon.left + 10; left++) {
        if (left + sCrop > 800 || top + sCrop > 1200) continue;

        const resized = await sharp('scratch/old_char_dragon.webp')
          .extract({ left, top, width: sCrop, height: sCrop })
          .resize(200, 200)
          .raw()
          .toBuffer();

        let diff = 0;
        let count = 0;
        for (let y = 30; y < 170; y += 2) {
          for (let x = 30; x < 170; x += 2) {
            const dx = x - 100;
            const dy = y - 100;
            if (dx * dx + dy * dy < 80 * 80) {
              const idx = (y * 200 + x) * 4;
              const rIdx = (y * 200 + x) * 3;
              const dr = resized[rIdx] - iconRaw.data[idx];
              const dg = resized[rIdx + 1] - iconRaw.data[idx + 1];
              const db = resized[rIdx + 2] - iconRaw.data[idx + 2];
              diff += dr * dr + dg * dg + db * db;
              count++;
            }
          }
        }

        const avgDiff = diff / count;
        if (avgDiff < minRefineIconDiff) {
          minRefineIconDiff = avgDiff;
          refineIcon = { left, top, size: sCrop, avgDiff };
        }
      }
    }
  }
  console.log('精密探索 精密 Icon:', refineIcon);
}

main().catch(console.error);
