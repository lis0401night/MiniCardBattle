import sharp from 'sharp';

async function main() {
  // 1. ダメージ生成画像を 200x200 にリサイズ
  const damageResized = await sharp(
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/icon_dragon_damage_gen_1789884595411.jpg'
  )
    .resize(200, 200)
    .toBuffer();

  // 2. 目、眉、鼻、口、頬の傷を含む領域の楕円フェザーマスク
  // 顔中心: cx=98, cy=132, rx=48, ry=38
  const featherMask = Buffer.from(`
    <svg width="200" height="200">
      <defs>
        <radialGradient id="grad" cx="49%" cy="66%" r="24%" fx="49%" fy="66%">
          <stop offset="70%" stop-color="white" stop-opacity="1"/>
          <stop offset="95%" stop-color="white" stop-opacity="0.5"/>
          <stop offset="100%" stop-color="white" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="200" height="200" fill="url(#grad)"/>
    </svg>
  `);

  const faceOverlay = await sharp(damageResized)
    .composite([{ input: featherMask, blend: 'dest-in' }])
    .toBuffer();

  // 3. 通常アイコン（icon_dragon.webp）の上に表情オーバーレイを合成
  // 外側の円形マスクを再適用して完全な円形に
  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );

  await sharp('public/assets/icons/icon_dragon.webp')
    .composite([
      { input: faceOverlay, blend: 'over' },
      { input: circleSvg, blend: 'dest-in' },
    ])
    .webp({ quality: 90 })
    .toFile('public/assets/icons/icon_dragon_damage.webp');

  console.log('Saved icon_dragon_damage.webp with seamless face inpainting!');
}

main().catch(console.error);
