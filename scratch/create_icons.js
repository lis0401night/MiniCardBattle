import sharp from 'sharp';

async function main() {
  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );

  await sharp('public/assets/characters/char_dragon.webp')
    .extract({ left: 315, top: 175, width: 250, height: 250 })
    .resize(200, 200)
    .composite([
      {
        input: circleSvg,
        blend: 'dest-in',
      },
    ])
    .webp({ quality: 90 })
    .toFile('public/assets/icons/icon_dragon.webp');

  console.log('Saved icon_dragon.webp successfully');
}

main().catch(console.error);
