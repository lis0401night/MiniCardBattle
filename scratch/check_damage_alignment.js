import sharp from 'sharp';

async function main() {
  const width = 200;
  const height = 200;

  const normalSquarePath = 'scratch/summer_icon_square_centered.png';
  const genDamagePath =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/icon_dragon_summer_damage_perfect_1789890661964.jpg';

  const normalRaw = await sharp(normalSquarePath)
    .resize(width, height)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const damageRaw = await sharp(genDamagePath)
    .resize(width, height)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 1. 通常と生成ダメージ画像の 50:50 単純半透明重ね合わせ（アラインメント検査用）
  const alignCheckBuf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const i4 = i * 4;
    const i3 = i * 3;
    alignCheckBuf[i4] = Math.round(
      normalRaw.data[i3] * 0.5 + damageRaw.data[i3] * 0.5
    );
    alignCheckBuf[i4 + 1] = Math.round(
      normalRaw.data[i3 + 1] * 0.5 + damageRaw.data[i3 + 1] * 0.5
    );
    alignCheckBuf[i4 + 2] = Math.round(
      normalRaw.data[i3 + 2] * 0.5 + damageRaw.data[i3 + 2] * 0.5
    );
    alignCheckBuf[i4 + 3] = 255;
  }

  await sharp(alignCheckBuf, { raw: { width, height, channels: 4 } })
    .png()
    .toFile('scratch/summer_align_check_50_50.png');

  // 2. 差分（絶対値）マップの作成
  const diffBuf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const i4 = i * 4;
    const i3 = i * 3;
    const dr = Math.abs(normalRaw.data[i3] - damageRaw.data[i3]);
    const dg = Math.abs(normalRaw.data[i3 + 1] - damageRaw.data[i3 + 1]);
    const db = Math.abs(normalRaw.data[i3 + 2] - damageRaw.data[i3 + 2]);
    const diff = Math.max(dr, dg, db);
    diffBuf[i4] = diff * 2; // 強調表示
    diffBuf[i4 + 1] = diff * 2;
    diffBuf[i4 + 2] = diff * 2;
    diffBuf[i4 + 3] = 255;
  }

  await sharp(diffBuf, { raw: { width, height, channels: 4 } })
    .png()
    .toFile('scratch/summer_diff_map.png');

  console.log('Saved align check and diff map');
}

main().catch(console.error);
