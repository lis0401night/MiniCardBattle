import sharp from 'sharp';

async function main() {
  // すべて RGB (3 channels) に統一して比較する
  const charRaw = await sharp('scratch/old_char_dragon_summer.webp')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const boardRaw = await sharp('scratch/old_board_dragon_summer.webp')
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const iconRaw = await sharp('scratch/old_icon_dragon_summer.webp')
    .raw()
    .toBuffer({ resolveWithObject: true });

  console.log('--- 水着プレイマット探索 (RGB) ---');
  let bestBoard = null;
  let minBoardDiff = Infinity;

  // 通常スキンの実績は { left: 47, top: 159, width: 728, height: 364 } だった。
  // 水着も同じアスペクト比 2:1 で、幅 650〜800 の範囲を探索
  for (let wCrop = 600; wCrop <= 800; wCrop += 8) {
    const hCrop = Math.round(wCrop / 2);
    const maxLeft = 800 - wCrop;
    for (let top = 0; top <= 400; top += 8) {
      for (let left = 0; left <= maxLeft; left += 8) {
        const resized = await sharp('scratch/old_char_dragon_summer.webp')
          .extract({ left, top, width: wCrop, height: hCrop })
          .resize(400, 200)
          .removeAlpha()
          .raw()
          .toBuffer();

        let diff = 0;
        for (let i = 0; i < resized.length; i += 30) {
          const d = resized[i] - boardRaw.data[i];
          diff += d * d;
        }

        if (!isNaN(diff) && diff < minBoardDiff) {
          minBoardDiff = diff;
          bestBoard = { left, top, wCrop, hCrop, diff };
        }
      }
    }
  }
  console.log('粗探索 Best Board:', bestBoard);

  if (bestBoard) {
    let refineBoard = bestBoard;
    let minRefineDiff = Infinity;
    for (
      let wCrop = bestBoard.wCrop - 10;
      wCrop <= bestBoard.wCrop + 10;
      wCrop++
    ) {
      const hCrop = Math.round(wCrop / 2);
      for (
        let top = Math.max(0, bestBoard.top - 10);
        top <= bestBoard.top + 10;
        top++
      ) {
        for (
          let left = Math.max(0, bestBoard.left - 10);
          left <= Math.min(800 - wCrop, bestBoard.left + 10);
          left++
        ) {
          const resized = await sharp('scratch/old_char_dragon_summer.webp')
            .extract({ left, top, width: wCrop, height: hCrop })
            .resize(400, 200)
            .removeAlpha()
            .raw()
            .toBuffer();

          let diff = 0;
          for (let i = 0; i < resized.length; i += 12) {
            const d = resized[i] - boardRaw.data[i];
            diff += d * d;
          }

          if (!isNaN(diff) && diff < minRefineDiff) {
            minRefineDiff = diff;
            refineBoard = { left, top, width: wCrop, height: hCrop, diff };
          }
        }
      }
    }
    console.log('精密探索 精密 Board:', refineBoard);
  }

  console.log('--- 水着アイコン探索 ---');
  let bestIcon = null;
  let minIconDiff = Infinity;

  // 通常スキンの実績は { left: 292, top: 155, size: 257 }
  // 水着の顔周辺 (size: 200〜350)
  for (let sCrop = 200; sCrop <= 360; sCrop += 8) {
    for (let top = 80; top <= 300; top += 8) {
      for (let left = 200; left <= 500; left += 8) {
        if (left + sCrop > 800 || top + sCrop > 1200) continue;

        const resized = await sharp('scratch/old_char_dragon_summer.webp')
          .extract({ left, top, width: sCrop, height: sCrop })
          .resize(200, 200)
          .removeAlpha()
          .raw()
          .toBuffer();

        let diff = 0;
        let count = 0;
        for (let y = 40; y < 160; y += 4) {
          for (let x = 40; x < 160; x += 4) {
            const dx = x - 100;
            const dy = y - 100;
            if (dx * dx + dy * dy < 60 * 60) {
              const rIdx = (y * 200 + x) * 3;
              const idx = (y * 200 + x) * 4;
              const dr = resized[rIdx] - iconRaw.data[idx];
              const dg = resized[rIdx + 1] - iconRaw.data[idx + 1];
              const db = resized[rIdx + 2] - iconRaw.data[idx + 2];
              diff += dr * dr + dg * dg + db * db;
              count++;
            }
          }
        }

        const avgDiff = diff / count;
        if (!isNaN(avgDiff) && avgDiff < minIconDiff) {
          minIconDiff = avgDiff;
          bestIcon = { left, top, size: sCrop, avgDiff };
        }
      }
    }
  }
  console.log('粗探索 Best Icon:', bestIcon);

  if (bestIcon) {
    let refineIcon = bestIcon;
    let minRefineIconDiff = Infinity;
    for (let sCrop = bestIcon.size - 8; sCrop <= bestIcon.size + 8; sCrop++) {
      for (let top = bestIcon.top - 8; top <= bestIcon.top + 8; top++) {
        for (let left = bestIcon.left - 8; left <= bestIcon.left + 8; left++) {
          if (left + sCrop > 800 || top + sCrop > 1200) continue;

          const resized = await sharp('scratch/old_char_dragon_summer.webp')
            .extract({ left, top, width: sCrop, height: sCrop })
            .resize(200, 200)
            .removeAlpha()
            .raw()
            .toBuffer();

          let diff = 0;
          let count = 0;
          for (let y = 30; y < 170; y += 2) {
            for (let x = 30; x < 170; x += 2) {
              const dx = x - 100;
              const dy = y - 100;
              if (dx * dx + dy * dy < 75 * 75) {
                const rIdx = (y * 200 + x) * 3;
                const idx = (y * 200 + x) * 4;
                const dr = resized[rIdx] - iconRaw.data[idx];
                const dg = resized[rIdx + 1] - iconRaw.data[idx + 1];
                const db = resized[rIdx + 2] - iconRaw.data[idx + 2];
                diff += dr * dr + dg * dg + db * db;
                count++;
              }
            }
          }

          const avgDiff = diff / count;
          if (!isNaN(avgDiff) && avgDiff < minRefineIconDiff) {
            minRefineIconDiff = avgDiff;
            refineIcon = { left, top, size: sCrop, avgDiff };
          }
        }
      }
    }
    console.log('精密探索 精密 Icon:', refineIcon);
  }
}

main().catch(console.error);
