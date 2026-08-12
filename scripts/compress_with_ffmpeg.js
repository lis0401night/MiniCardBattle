import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = util.promisify(execFile);

const targets = [
  { name: 'card_motorcycle_premium.webp', fps: 30, q: 60 },
  { name: 'card_djinn_premium.webp', fps: 25, q: 60 },
  { name: 'card_gungnir_premium.webp', fps: 25, q: 60 }
];

async function runCompress() {
  console.log('ffmpegPath:', ffmpegPath);

  for (const item of targets) {
    const srcPath = path.join('public/assets/cards', item.name);
    const tempPath = path.join('public/assets/cards', `optimized_${item.name}`);

    if (!fs.existsSync(srcPath)) continue;

    const originalStats = fs.statSync(srcPath);
    const originalSizeMB = (originalStats.size / (1024 * 1024)).toFixed(2);

    // ffmpeg コマンド引数
    // -i srcPath -vf "fps=fps_val" -quality q_val -loop 0 tempPath
    const args = [
      '-y',
      '-i', srcPath,
      '-vf', `fps=${item.fps}`,
      '-quality', `${item.q}`,
      '-loop', '0',
      tempPath
    ];

    try {
      console.log(`圧縮中: ${item.name} ...`);
      await execFileAsync(ffmpegPath, args);

      if (fs.existsSync(tempPath)) {
        const newStats = fs.statSync(tempPath);
        const newSizeMB = (newStats.size / (1024 * 1024)).toFixed(2);
        const reduction = (((originalStats.size - newStats.size) / originalStats.size) * 100).toFixed(1);

        console.log(`[成功] ${item.name}`);
        console.log(`  元サイズ: ${originalSizeMB} MB -> 最適化後: ${newSizeMB} MB (-${reduction}%)`);

        // 元のファイルをバックアップして、最適化後のファイルで差し替え
        const backupPath = path.join('public/assets/cards', `bak_${item.name}`);
        if (!fs.existsSync(backupPath)) {
          fs.copyFileSync(srcPath, backupPath);
        }
        fs.renameSync(tempPath, srcPath);
      }
    } catch (err) {
      console.error(`[エラー] ${item.name}:`, err.message || err);
    }
  }
}

runCompress();
