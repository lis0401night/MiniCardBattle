import sharp from 'sharp';

async function main() {
  const charMeta = await sharp('scratch/old_char_dragon_school.webp').metadata();
  const boardMeta = await sharp('scratch/old_board_dragon_school.png').metadata();
  const iconMeta = await sharp('scratch/old_icon_dragon_school.png').metadata();

  console.log('Char size:', charMeta.width, charMeta.height);
  console.log('Board size:', boardMeta.width, boardMeta.height);
  console.log('Icon size:', iconMeta.width, iconMeta.height);

  // プレイマットの画像と立ち絵画像のテンプレートマッチング
  // プレイマット中央（x: 180~220, y: 80~120）の 40x40 パッチを取得
  const patch = await sharp('scratch/old_board_dragon_school.png')
    .extract({ left: 180, top: 90, width: 40, height: 40 })
    .png()
    .toBuffer();

  await sharp(patch).toFile('scratch/board_patch.png');

  // また、立ち絵から幾つかのスケール (scale = 400 / W) で切り出し、
  // プレイマットと重ねて差分を確認するテスト画像を生成
  // プレイマットの横幅 W は通常 700 ~ 800
  // 例えば W = 800 (全幅), top = 0 ~ 50 あたりが有力
  const testScales = [
    { left: 0, top: 0, width: 800, height: 400 },
    { left: 0, top: 20, width: 800, height: 400 },
    { left: 10, top: 10, width: 780, height: 390 },
    { left: 20, top: 20, width: 760, height: 380 },
    { left: 30, top: 30, width: 740, height: 370 },
  ];

  for (let i = 0; i < testScales.length; i++) {
    const s = testScales[i];
    await sharp('scratch/old_char_dragon_school.webp')
      .extract(s)
      .resize(400, 200)
      .png()
      .toFile(`scratch/board_test_${i}.png`);
  }

  // 同様に、アイコンの候補もテスト
  // アイコンは顔中心 (x: 400 付近, y: 200 付近)
  // size は 250 ~ 290
  const iconScales = [
    { left: 280, top: 120, size: 260 },
    { left: 285, top: 125, size: 260 },
    { left: 290, top: 130, size: 260 },
    { left: 275, top: 120, size: 270 },
    { left: 280, top: 125, size: 270 },
    { left: 285, top: 130, size: 270 },
  ];

  for (let i = 0; i < iconScales.length; i++) {
    const s = iconScales[i];
    await sharp('scratch/old_char_dragon_school.webp')
      .extract({ left: s.left, top: s.top, width: s.size, height: s.size })
      .resize(200, 200)
      .png()
      .toFile(`scratch/icon_test_${i}.png`);
  }

  console.log('Saved test images for visual matching');
}

main().catch(console.error);
