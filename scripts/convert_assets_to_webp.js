import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

// Windows環境でのファイルロック解放のため、キャッシュを無効化
sharp.cache(false);

const targetDirs = [
  './public/assets/backgrounds',
  './public/assets/characters',
  './public/assets/icons',
  './public/assets/cards',
  './public/assets/boards',
];

const reportFile = './scratch/webp_conversion_report.md';

function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  const sign = bytes < 0 ? '-' : '';
  return (
    sign +
    parseFloat((Math.abs(bytes) / Math.pow(k, i)).toFixed(dm)) +
    ' ' +
    sizes[i]
  );
}

// ディレクトリ下の画像ファイルを再帰的に取得
function getFilesRecursively(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  files.forEach((file) => {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getFilesRecursively(filePath, fileList);
    } else {
      const ext = path.extname(file).toLowerCase();
      if (['.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
        fileList.push(filePath);
      }
    }
  });
  return fileList;
}

async function convertAssets() {
  try {
    let allImageFiles = [];
    targetDirs.forEach((dir) => {
      if (fs.existsSync(dir)) {
        allImageFiles = allImageFiles.concat(getFilesRecursively(dir));
      }
    });

    if (allImageFiles.length === 0) {
      // 変換対象がない場合はログ出力して終了
      return;
    }

    console.log(`[WebP変換] 対象画像ファイル数: ${allImageFiles.length}件`);

    let totalOriginalSize = 0;
    let totalWebpSize = 0;
    const details = [];

    // scratch ディレクトリ作成
    const scratchDir = path.dirname(reportFile);
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true });
    }

    for (const filePath of allImageFiles) {
      const dirName = path.dirname(filePath);
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const webpFileName =
        fileName.substring(0, fileName.length - ext.length) + '.webp';
      const outputPath = path.join(dirName, webpFileName);

      const originalSize = fs.statSync(filePath).size;
      totalOriginalSize += originalSize;

      console.log(
        `[WebP変換] 変換中: ${filePath} (${formatBytes(originalSize)}) ...`
      );

      const isAnimated = ext === '.gif';

      // { animated: true } を指定（GIFの場合のみ）
      const sharpInstance = sharp(
        filePath,
        isAnimated ? { animated: true } : {}
      );

      await sharpInstance
        .webp({
          quality: 85,
          effort: 6,
        })
        .toFile(outputPath);

      const webpSize = fs.statSync(outputPath).size;
      totalWebpSize += webpSize;

      const reducedSize = originalSize - webpSize;
      const reductionPercent = ((reducedSize / originalSize) * 100).toFixed(2);

      console.log(
        `[WebP変換] 完了: -> ${webpFileName} (${formatBytes(webpSize)}) [削減: ${formatBytes(reducedSize)} / ${reductionPercent}%]`
      );

      // 元のファイルを削除
      fs.unlinkSync(filePath);

      details.push({
        path: filePath,
        name: fileName,
        original: originalSize,
        webp: webpSize,
        reduced: reducedSize,
        percent: reductionPercent,
      });
    }

    const totalReduced = totalOriginalSize - totalWebpSize;
    const totalPercent = ((totalReduced / totalOriginalSize) * 100).toFixed(2);

    console.log('\n--- WebP変換結果サマリー ---');
    console.log(`元の合計サイズ: ${formatBytes(totalOriginalSize)}`);
    console.log(`変換後の合計サイズ: ${formatBytes(totalWebpSize)}`);
    console.log(`合計削減量: ${formatBytes(totalReduced)}`);
    console.log(`全体削減率: ${totalPercent}%`);

    // レポートマークダウン生成
    let reportMd = `# 高品質非可逆WebP一括変換レポート\n\n`;
    reportMd += `- 実行日時: ${new Date().toLocaleString('ja-JP')}\n`;
    reportMd += `- 変換ファイル数: ${allImageFiles.length} 件\n`;
    reportMd += `- 元の合計サイズ: **${formatBytes(totalOriginalSize)}**\n`;
    reportMd += `- 変換後の合計サイズ: **${formatBytes(totalWebpSize)}**\n`;
    reportMd += `- 合計削減量: **${formatBytes(totalReduced)}**\n`;
    reportMd += `- 全体削減率: **${totalPercent}%**\n\n`;

    reportMd += `## 詳細一覧\n\n`;
    reportMd += `| ファイルパス | 元のサイズ | 変換後のサイズ | 削減量 | 削減率 |\n`;
    reportMd += `| :--- | :--- | :--- | :--- | :--- |\n`;

    details.sort((a, b) => b.reduced - a.reduced); // 削減量順にソート

    details.forEach((d) => {
      reportMd += `| ${d.path.replace(/\\/g, '/')} | ${formatBytes(d.original)} | ${formatBytes(d.webp)} | ${formatBytes(d.reduced)} | ${d.percent}% |\n`;
    });

    fs.writeFileSync(reportFile, reportMd, 'utf-8');
    console.log(`[WebP変換] レポートを ${reportFile} に保存しました。`);
  } catch (error) {
    console.error('[WebP変換] 一括変換中にエラーが発生しました:', error);
  }
}

convertAssets();
