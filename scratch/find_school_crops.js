import sharp from 'sharp';
import fs from 'fs';

async function main() {
  const charPath = 'public/assets/characters/char_dragon_school.webp';
  const iconPath = 'public/assets/icons/icon_dragon_school.webp';
  const boardPath = 'public/assets/boards/board_dragon_school.webp';

  // 1. バックアップ
  fs.copyFileSync(charPath, 'scratch/old_char_dragon_school.webp');
  fs.copyFileSync(iconPath, 'scratch/old_icon_dragon_school.webp');
  fs.copyFileSync(boardPath, 'scratch/old_board_dragon_school.webp');
  console.log('Backed up old school assets to scratch/');

  // 立ち絵とプレイマット、アイコンを比較
  // プレイマット (400x200) は立ち絵 (800x1200) からの切り出し＆縮小
  // 旧プレイマットの画像と旧立ち絵の画像を view_file で確認しつつ、
  // プレイマットの特徴的なパーツ（ギターのヘッド、顔、街並み）から大体の矩形を絞る
  const boardMeta = await sharp(boardPath).metadata();
  console.log('Board dimensions:', boardMeta.width, boardMeta.height);

  // プレイマットの四隅の特徴を調べる
  // board_dragon_school.webp を scratch に png で出力して確認
  await sharp(boardPath).png().toFile('scratch/old_board_dragon_school.png');
  await sharp(iconPath).png().toFile('scratch/old_icon_dragon_school.png');

  console.log('Exported debug images');
}

main().catch(console.error);
