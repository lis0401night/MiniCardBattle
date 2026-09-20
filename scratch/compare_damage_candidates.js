import sharp from 'sharp';

async function main() {
  const width = 200;
  const height = 200;

  const normalDest = 'public/assets/icons/icon_dragon_summer.webp';
  const genDamagePath =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/icon_dragon_summer_damage_perfect_1789890661964.jpg';

  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );

  // パターンA: 生成画像をそのまま 200x200 にリサイズして円形マスク
  await sharp(genDamagePath)
    .resize(width, height)
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .webp({ quality: 90 })
    .toFile('scratch/summer_damage_candidate_A.webp');

  // パターンB: 通常アイコンの顔部分（目・鼻・口・傷）のみをダメージ画像で置き換え
  // 通常アイコン画像（RGBA）
  const normalRaw = await sharp(normalDest)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const damageRaw = await sharp(genDamagePath)
    .resize(width, height)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 顔の表情領域
  // 眉間・目・口・頬の傷を含む楕円
  // cx = 100, cy = 130, rx = 36, ry = 34
  const outBufB = Buffer.alloc(width * height * 4);
  const cx = 100;
  const cy = 130;
  const rx = 36;
  const ry = 34;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx4 = (y * width + x) * 4;
      const idx3 = (y * width + x) * 3;

      const alpha = normalRaw.data[idx4 + 3];
      if (alpha === 0) {
        outBufB[idx4 + 3] = 0;
        continue;
      }

      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const dist = Math.sqrt(nx * nx + ny * ny);

      let t = 0;
      if (dist <= 0.75) {
        t = 1.0;
      } else if (dist < 1.0) {
        const p = (dist - 0.75) / 0.25;
        t = 0.5 * (1 + Math.cos(Math.PI * p));
      } else {
        t = 0.0;
      }

      const nr = normalRaw.data[idx4];
      const ng = normalRaw.data[idx4 + 1];
      const nb = normalRaw.data[idx4 + 2];

      const dr = damageRaw.data[idx3];
      const dg = damageRaw.data[idx3 + 1];
      const db = damageRaw.data[idx3 + 2];

      outBufB[idx4] = Math.round(dr * t + nr * (1 - t));
      outBufB[idx4 + 1] = Math.round(dg * t + ng * (1 - t));
      outBufB[idx4 + 2] = Math.round(db * t + nb * (1 - t));
      outBufB[idx4 + 3] = alpha;
    }
  }

  await sharp(outBufB, { raw: { width, height, channels: 4 } })
    .webp({ quality: 90 })
    .toFile('scratch/summer_damage_candidate_B.webp');

  // 十字線を付けた検証用画像も作成
  const crossSvg = Buffer.from(`
    <svg width="200" height="200">
      <circle cx="100" cy="100" r="96" fill="none" stroke="red" stroke-width="2"/>
      <line x1="100" y1="0" x2="100" y2="200" stroke="red" stroke-width="1"/>
      <line x1="0" y1="100" x2="200" y2="100" stroke="red" stroke-width="1"/>
    </svg>
  `);

  await sharp('scratch/summer_damage_candidate_A.webp')
    .composite([{ input: crossSvg }])
    .toFile('scratch/summer_damage_A_cross.png');

  await sharp('scratch/summer_damage_candidate_B.webp')
    .composite([{ input: crossSvg }])
    .toFile('scratch/summer_damage_B_cross.png');

  console.log('Generated candidates A and B');
}

main().catch(console.error);
