import sharp from 'sharp';

async function main() {
  const genDamagePath =
    'C:/Users/owner/.gemini/antigravity/brain/254a419a-60ff-405b-bd08-be766c7f7196/icon_dragon_summer_damage_perfect_1789890661964.jpg';
  const damageDest = 'public/assets/icons/icon_dragon_summer_damage.webp';

  const circleSvg = Buffer.from(
    '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
  );

  await sharp(genDamagePath)
    .resize(200, 200)
    .composite([{ input: circleSvg, blend: 'dest-in' }])
    .webp({ quality: 90 })
    .toFile(damageDest);

  console.log('Successfully installed final icon_dragon_summer_damage.webp');
}

main().catch(console.error);
