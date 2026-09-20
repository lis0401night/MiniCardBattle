import sharp from 'sharp';

async function main() {
  const width = 200;
  const height = 200;

  const charPath = 'public/assets/characters/char_dragon_summer.webp';
  const normalDest = 'public/assets/icons/icon_dragon_summer.webp';
  const damageDest = 'public/assets/icons/icon_dragon_summer_damage.webp';

  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );

  // 1. 中央寄せした通常水着アイコン生成
  // left: 265, top: 145, size: 290
  await sharp(charPath)
    .extract({ left: 265, top: 145, width: 290, height: 290 })
    .resize(width, height)
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .webp({ quality: 90 })
    .toFile(normalDest);
  console.log('Saved centered icon_dragon_summer.webp');

  // 2. ダメージアイコンの再合成
  // 新通常アイコンのRAWデータを取得
  const normalRaw = await sharp(normalDest)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // ダメージ表情画像を通常アイコンの位置に合わせてリサイズ・クロップ
  // 元のダメージ生成画像 (1024x1024) の顔の位置は、元の抽出 (295, 172, 259) に近かった
  // 新しいトリミング (265, 145, 290) に合わせて、ダメージ画像を少し調整
  // 比率: 259 / 290 ≈ 0.893
  // dx, dy のオフセット:
  // left が 30px 左へ、top が 27px 上へ移動したため、画像内の顔は右下へ移動している
  // ダメージ表情の顔中心: cx ≈ 105, cy ≈ 128
  const cx = 105;
  const cy = 128;
  const rx = 46;
  const ry = 38;

  // ダメージ元画像を新通常アイコンの顔位置に合わせてリサイズ＆配置
  const damageRaw = await sharp(
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/icon_dragon_summer_damage_gen_1789889434318.jpg'
  )
    .resize(Math.round(200 * (259 / 290)), Math.round(200 * (259 / 290)))
    .extend({
      top: Math.round(145 - 172 * (290 / 259) + 30), // パディング調整
      left: Math.round(265 - 295 * (290 / 259) + 30),
      bottom: 50,
      right: 50,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(width, height)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const outBuf = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx4 = (y * width + x) * 4;
      const idx3 = (y * width + x) * 3;

      const dCircle = Math.sqrt((x - 100) ** 2 + (y - 100) ** 2);
      if (dCircle > 96.5) {
        outBuf[idx4 + 3] = 0;
        continue;
      }
      const circleAlpha =
        dCircle > 95.5 ? Math.round(255 * (96.5 - dCircle)) : 255;

      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const dist = Math.sqrt(nx * nx + ny * ny);

      let t = 0;
      if (dist <= 0.65) {
        t = 1.0;
      } else if (dist < 1.0) {
        const p = (dist - 0.65) / 0.35;
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

      outBuf[idx4] = Math.round(dr * t + nr * (1 - t));
      outBuf[idx4 + 1] = Math.round(dg * t + ng * (1 - t));
      outBuf[idx4 + 2] = Math.round(db * t + nb * (1 - t));
      outBuf[idx4 + 3] = circleAlpha;
    }
  }

  await sharp(outBuf, { raw: { width, height, channels: 4 } })
    .webp({ quality: 90 })
    .toFile(damageDest);

  console.log('Saved centered icon_dragon_summer_damage.webp successfully');
}

main().catch(console.error);
