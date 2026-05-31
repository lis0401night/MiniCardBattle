import fs from 'fs';

// PNGファイルの幅と高さをバイナリから解析する簡単な関数
function getPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  // PNGのヘッダ確認
  if (buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Not a PNG file');
  }
  // IHDRチャンクから幅と高さを取得 (Big Endian 32bit)
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  return { width, height };
}

try {
  const size = getPngSize('public/assets/vfx/vfx_skill_snipe.png');
  console.log('Image dimensions:', size.width, 'x', size.height);
} catch (e) {
  console.error('Error reading image size:', e.message);
}
