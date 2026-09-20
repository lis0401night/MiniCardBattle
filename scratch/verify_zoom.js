import sharp from 'sharp';

async function main() {
  // 通常アイコンと z4 を半透明合成して顔のサイズ・位置の一致を検証
  await sharp('public/assets/icons/icon_dragon.webp')
    .composite([{ input: 'scratch/zoom_z4.png', opacity: 0.5 }])
    .toFile('scratch/verify_zoom_alignment.png');

  console.log('Saved scratch/verify_zoom_alignment.png');
}

main().catch(console.error);
