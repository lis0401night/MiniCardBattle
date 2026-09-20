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

  // 1. 通常水着アイコン: 通常アイコンと完全に同じ拡大率（size: 257）かつ中央寄せ（left: 275, top: 160）
  await sharp(charPath)
    .extract({ left: 275, top: 160, width: 257, height: 257 })
    .resize(width, height)
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .webp({ quality: 90 })
    .toFile(normalDest);
  console.log('Saved 1:1 scale centered icon_dragon_summer.webp');

  // 2. ダメージアイコンの作成
  // 通常アイコンをベースに読み込み
  const normalRaw = await sharp(normalDest)
    .raw()
    .toBuffer({ resolveWithObject: true });

  // ダメージ表情画像を通常アイコンの顔サイズ・位置に合わせてリサイズ＆クロップ
  // ダメージ元画像: icon_dragon_summer_damage_centered_1789889814320.jpg
  // この元画像はすでに中央寄せされたアイコン構図
  const damageRaw = await sharp(
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/icon_dragon_summer_damage_centered_1789889814320.jpg'
  )
    .resize(width, height)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 表情パーツ（目・眉・口・鼻・傷）の中心座標と半径
  const cx = 98;
  const cy = 126;
  const rx = 44;
  const ry = 36;

  const outBuf = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx4 = (y * width + x) * 4;
      const idx3 = (y * width + x) * 3;

      // 円形マスク (中心100, 100, 半径96)
      const dCircle = Math.sqrt((x - 100) ** 2 + (y - 100) ** 2);
      if (dCircle > 96.5) {
        outBuf[idx4 + 3] = 0;
        continue;
      }
      const circleAlpha =
        dCircle > 95.5 ? Math.round(255 * (96.5 - dCircle)) : 255;

      // 楕円フェザーブレンド率 t
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

  console.log(
    'Saved 1:1 scale seamless icon_dragon_summer_damage.webp successfully'
  );
}

main().catch(console.error);
