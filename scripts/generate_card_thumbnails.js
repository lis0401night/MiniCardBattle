import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// キャッシュを無効化してファイルロックを防止
sharp.cache(false);

const targetDirs = [
  { dir: './public/assets/cards', prefix: 'card_' },
  { dir: './public/assets/characters', prefix: 'char_' },
  { dir: './public/assets/boards', prefix: 'board_' },
  { dir: './public/assets/stages', prefix: 'stage_' },
];

async function generateThumbnails() {
  console.log('[Thumbnail] 画像のサムネイル自動生成を開始します...');

  let totalSuccess = 0;
  let totalSkip = 0;
  let totalFail = 0;

  for (const { dir, prefix } of targetDirs) {
    if (!fs.existsSync(dir)) {
      console.warn(`[Thumbnail] 警告: ディレクトリが見つかりません: ${dir}`);
      continue;
    }

    const files = fs.readdirSync(dir);
    const targetFiles = files.filter((file) => {
      const ext = path.extname(file).toLowerCase();
      // すでにサムネイル（_thumb）になっているものや、バックアップ、一時ファイルは除外
      // 指定の接頭辞（card_ や char_）で始まるもののみ処理
      return (
        ext === '.webp' &&
        file.startsWith(prefix) &&
        !file.endsWith('_thumb.webp') &&
        !file.endsWith('_backup.webp') &&
        !file.startsWith('card_default') // デフォルトカード画像はリサイズ不要
      );
    });

    console.log(
      `[Thumbnail] ${dir} 内の処理対象画像数: ${targetFiles.length} 件`
    );

    for (const file of targetFiles) {
      const inputPath = path.join(dir, file);
      const ext = path.extname(file);
      const baseName = file.substring(0, file.length - ext.length);
      const outputPath = path.join(dir, `${baseName}_thumb.webp`);

      // 既にサムネイルが存在し、元画像より新しい場合はスキップ（インクリメンタルビルド）
      if (fs.existsSync(outputPath)) {
        const inputStat = fs.statSync(inputPath);
        const outputStat = fs.statSync(outputPath);
        if (outputStat.mtime > inputStat.mtime) {
          totalSkip++;
          continue;
        }
      }

      try {
        const isAnimated = file.includes('_premium');

        // sharp の読み込み設定
        const sharpInstance = sharp(
          inputPath,
          isAnimated ? { animated: true } : {}
        );

        // 横幅を 200px に拡張し、高画素密度(Retina等)に対応しつつアスペクト比を維持
        await sharpInstance
          .resize({ width: 200 })
          .webp({
            quality: 85,
            effort: 6,
          })
          .toFile(outputPath);

        totalSuccess++;
        const originalSize = fs.statSync(inputPath).size;
        const thumbSize = fs.statSync(outputPath).size;
        console.log(
          `[Thumbnail] 生成成功: ${dir}/${file} (${(originalSize / 1024).toFixed(1)} KB) -> ${baseName}_thumb.webp (${(thumbSize / 1024).toFixed(1)} KB)`
        );
      } catch (e) {
        console.error(`[Thumbnail] 生成失敗: ${dir}/${file}`, e);
        totalFail++;
      }
    }
  }

  console.log('--- サムネイル生成結果サマリー ---');
  console.log(`新規作成/更新: ${totalSuccess} 件`);
  console.log(`スキップ（更新なし）: ${totalSkip} 件`);
  console.log(`失敗: ${totalFail} 件`);
}

generateThumbnails();
