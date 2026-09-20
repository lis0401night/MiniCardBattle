import sharp from 'sharp';

async function main() {
  const charPath = 'public/assets/characters/char_dragon_summer.webp';
  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );

  // 現在は left: 295, top: 172, size: 259
  // 顔を中央（やや右下）に寄せるため、切り抜き枠を left を小さく（左へ）、top を小さく（上へ）
  // また、ズーム感（size）を少し広げるとツノと首元がゆったり中央に収まる
  const candidates = [
    { name: 'adj1', left: 275, top: 155, size: 275 }, // 全体に少し引き、左上へ広げて顔を中央へ
    { name: 'adj2', left: 265, top: 145, size: 290 }, // より通常アイコンに近い構図（ツノと顔が中央）
    { name: 'adj3', left: 280, top: 150, size: 270 }, // 控えめ調整
    { name: 'adj4', left: 260, top: 140, size: 300 }, // さらにゆったり中央
  ];

  for (const c of candidates) {
    await sharp(charPath)
      .extract({ left: c.left, top: c.top, width: c.size, height: c.size })
      .resize(200, 200)
      .composite([{ input: circleSvg, blend: 'dest-in' }])
      .toFile(`scratch/summer_icon_${c.name}.png`);
  }

  console.log('Saved adjustment candidates');
}

main().catch(console.error);
