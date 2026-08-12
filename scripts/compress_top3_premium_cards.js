import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'child_process';
import util from 'util';
import fs from 'fs';
import path from 'path';

const execFileAsync = util.promisify(execFile);

// 3つの重いプレミアムカード画像の軽量化設定
// GIF減色（256色制限）は一切使わず、フルカラー・透明度（アルファチャンネル）完全保持のPNGシーケンス経由でWebP(libwebp)に直接軽量化
const targets = [
  { name: 'card_motorcycle_premium.webp', step: 3, quality: 65 }, // 194コマ -> 65コマ (7.47MB -> ~1.6MB)
  { name: 'card_djinn_premium.webp', step: 2, quality: 60 },       // 64コマ -> 32コマ (5.80MB -> ~1.1MB)
  { name: 'card_gungnir_premium.webp', step: 2, quality: 65 }    // 121コマ -> 61コマ (3.72MB -> ~1.2MB)
];

async function optimizeTop3() {
  console.log('--- プレミアムカード画像 TOP3 の軽量化（PNG -> WebP直接再エンコード）を開始 ---');

  for (const item of targets) {
    const srcPath = path.join('public/assets/cards', item.name);
    if (!fs.existsSync(srcPath)) {
      console.warn(`[スキップ] ${item.name} が存在しません。`);
      continue;
    }

    // ファイルロックを防止するため、ファイル全体をまずメモリバッファとして読み込む
    const srcBuf = fs.readFileSync(srcPath);
    const originalSizeMB = (srcBuf.length / (1024 * 1024)).toFixed(2);

    const img = sharp(srcBuf, { animated: true });
    const metadata = await img.metadata();
    const totalPages = metadata.pages || 1;
    const pageHeight = metadata.pageHeight || Math.round(metadata.height / totalPages);
    const delays = metadata.delay || Array(totalPages).fill(33);
    img.destroy();

    console.log(`[処理中] ${item.name} (${originalSizeMB} MB, ${totalPages} コマ)...`);

    // 1. 各フレームの抽出（GIFではなくフルカラー・透明度保持のPNG形式を使用）
    const tmpDir = path.join('public/assets/cards', `_tmp_${item.name.replace('.webp', '')}`);
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const newDelays = [];
    let count = 0;

    for (let i = 0; i < totalPages; i += item.step) {
      const framePath = path.join(tmpDir, `frame_${String(count).padStart(4, '0')}.png`);
      
      const frameImg = sharp(srcBuf, { page: i });
      await frameImg
        .extract({ left: 0, top: 0, width: 400, height: pageHeight })
        .png({ compressionLevel: 6 })
        .toFile(framePath);
      frameImg.destroy();

      let sumDelay = 0;
      for (let j = 0; j < item.step && (i + j) < totalPages; j++) {
        sumDelay += delays[i + j] || 33;
      }
      newDelays.push(sumDelay);
      count++;
    }

    // 2. ffmpeg + libwebp による WebP 形式直接再エンコード
    const optPath = path.join('public/assets/cards', `opt_${item.name}`);
    const avgDelayMs = newDelays.reduce((a, b) => a + b, 0) / newDelays.length;
    const fps = Math.max(1, Math.round(1000 / avgDelayMs));

    const args = [
      '-y',
      '-framerate', `${fps}`,
      '-i', path.join(tmpDir, 'frame_%04d.png'),
      '-c:v', 'libwebp',
      '-compression_level', '6',
      '-q:v', `${item.quality}`,
      '-loop', '0',
      optPath
    ];

    await execFileAsync(ffmpegPath, args);

    // 3. 上書き保存（メモリバッファ経由のためロックなし）
    if (fs.existsSync(optPath)) {
      const optBuf = fs.readFileSync(optPath);
      const newSizeMB = (optBuf.length / (1024 * 1024)).toFixed(2);
      const reduction = (((srcBuf.length - optBuf.length) / srcBuf.length) * 100).toFixed(1);

      fs.writeFileSync(srcPath, optBuf);
      try { fs.unlinkSync(optPath); } catch {}

      console.log(`[成功] ${item.name}`);
      console.log(`   元サイズ: ${originalSizeMB} MB -> 軽量化後: ${newSizeMB} MB (削減率: -${reduction}%, 枠数: ${count}/${totalPages})`);
    }

    // 4. 一時フォルダのクリーンアップ
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('--- 軽量化処理完了 ---');
}

optimizeTop3().catch(err => {
  console.error('エラー発生:', err);
  process.exit(1);
});
