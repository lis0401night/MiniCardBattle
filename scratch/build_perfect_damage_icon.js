import sharp from 'sharp';

async function main() {
  const width = 200;
  const height = 200;

  // 1. 通常アイコンのRGB/RGBAデータを取得
  const normalImg = sharp('public/assets/icons/icon_dragon.webp');
  const normalRaw = await normalImg.raw().toBuffer({ resolveWithObject: true });

  // 2. 新ダメージ顔画像 (1024x1024) を 200x200 にリサイズ
  const damageRaw = await sharp(
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/icon_dragon_damage_gen_1789884595411.jpg'
  )
    .resize(width, height)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 3. ピクセル単位でブレンドする
  // 表情の中心: cx = 98, cy = 132
  // 楕円半径: rx = 44, ry = 36
  // 半径内はダメージ顔、外側は通常アイコン、境界はコサイン（cosine）イージングで滑らかにフェード
  const outBuf = Buffer.alloc(width * height * 4);

  const cx = 98;
  const cy = 132;
  const rx = 42;
  const ry = 36;
  const feather = 12; // 境界のぼかし幅

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx4 = (y * width + x) * 4;
      const idx3 = (y * width + x) * 3;

      // アイコン外側の円形クリッピング (中心100, 100, 半径96)
      const dCircle = Math.sqrt((x - 100) ** 2 + (y - 100) ** 2);
      let circleAlpha = 255;
      if (dCircle > 96.5) {
        circleAlpha = 0;
      } else if (dCircle > 95.5) {
        circleAlpha = Math.round(255 * (96.5 - dCircle));
      }

      if (circleAlpha === 0) {
        outBuf[idx4] = 0;
        outBuf[idx4 + 1] = 0;
        outBuf[idx4 + 2] = 0;
        outBuf[idx4 + 3] = 0;
        continue;
      }

      // 顔中心からの正規化楕円距離
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const dist = Math.sqrt(nx * nx + ny * ny);

      // t: ダメージ顔のブレンド率 (1.0 = ダメージ顔, 0.0 = 通常アイコン)
      let t = 0;
      if (dist <= 0.7) {
        t = 1.0;
      } else if (dist < 1.0) {
        // スムースステップ
        const p = (dist - 0.7) / 0.3;
        t = 0.5 * (1 + Math.cos(Math.PI * p));
      } else {
        t = 0.0;
      }

      // 通常アイコンピクセル
      const nr = normalRaw.data[idx4];
      const ng = normalRaw.data[idx4 + 1];
      const nb = normalRaw.data[idx4 + 2];

      // ダメージ顔ピクセル
      const dr = damageRaw.data[idx3];
      const dg = damageRaw.data[idx3 + 1];
      const db = damageRaw.data[idx3 + 2];

      outBuf[idx4] = Math.round(dr * t + nr * (1 - t));
      outBuf[idx4 + 1] = Math.round(dg * t + ng * (1 - t));
      outBuf[idx4 + 2] = Math.round(db * t + nb * (1 - t));
      outBuf[idx4 + 3] = circleAlpha;
    }
  }

  await sharp(outBuf, {
    raw: { width, height, channels: 4 },
  })
    .webp({ quality: 90 })
    .toFile('public/assets/icons/icon_dragon_damage.webp');

  console.log('Saved perfect icon_dragon_damage.webp successfully');
}

main().catch(console.error);
