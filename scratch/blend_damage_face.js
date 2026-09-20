import sharp from 'sharp';

async function main() {
  const normalIcon = sharp('public/assets/icons/icon_dragon.webp');
  const normalRaw = await normalIcon
    .raw()
    .toBuffer({ resolveWithObject: true });

  const damageGen = sharp(
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/icon_dragon_damage_gen_1789884595411.jpg'
  );

  // damageGen を 200x200 にリサイズ
  // 微妙な位置合わせ (offset dx, dy) を調整
  // 試しに dx: -2, -1, 0, 1, 2, dy: -2, -1, 0, 1, 2 で最も目の位置が合うものを探す
  const testOffsets = [
    { dx: 0, dy: 0 },
    { dx: -2, dy: -2 },
    { dx: 2, dy: 2 },
    { dx: -3, dy: 1 },
    { dx: -2, dy: 2 },
  ];

  for (let i = 0; i < testOffsets.length; i++) {
    const { dx, dy } = testOffsets[i];
    // 顔の目・鼻・口・傷の領域を中心とした楕円形のソフトフェザーマスク
    // 中心 (90, 130), 半径 rx=45, ry=35
    const maskSvg = Buffer.from(`
      <svg width="200" height="200">
        <defs>
          <radialGradient id="fade" cx="47%" cy="63%" r="28%" fx="47%" fy="63%">
            <stop offset="60%" stop-color="white" stop-opacity="1"/>
            <stop offset="95%" stop-color="white" stop-opacity="0.3"/>
            <stop offset="100%" stop-color="white" stop-opacity="0"/>
          </radialGradient>
        </defs>
        <rect width="200" height="200" fill="url(#fade)"/>
      </svg>
    `);

    const damageLayer = await damageGen
      .resize(200, 200)
      .composite([{ input: maskSvg, blend: 'dest-in' }])
      .toBuffer();

    // 通常アイコンの上に合成
    await sharp('public/assets/icons/icon_dragon.webp')
      .composite([{ input: damageLayer, left: dx, top: dy }])
      .toFile(`scratch/blend_test_${i}.png`);
  }

  console.log('Saved blend tests');
}

main().catch(console.error);
