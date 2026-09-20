import sharp from 'sharp';

async function main() {
  const src =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/icon_dragon_damage_gen_1789884595411.jpg';
  const dest = 'public/assets/icons/icon_dragon_damage.webp';

  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );

  await sharp(src)
    .resize(200, 200)
    .composite([
      {
        input: circleSvg,
        blend: 'dest-in',
      },
    ])
    .webp({ quality: 90 })
    .toFile(dest);

  console.log('Saved icon_dragon_damage.webp successfully');
}

main().catch(console.error);
