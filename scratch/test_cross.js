import sharp from 'sharp';

async function main() {
  const crossSvg = Buffer.from(`
    <svg width="200" height="200">
      <circle cx="100" cy="100" r="96" fill="none" stroke="red" stroke-width="2"/>
      <line x1="100" y1="0" x2="100" y2="200" stroke="red" stroke-width="1"/>
      <line x1="0" y1="100" x2="200" y2="100" stroke="red" stroke-width="1"/>
    </svg>
  `);

  await sharp('public/assets/icons/icon_dragon_summer.webp')
    .composite([{ input: crossSvg }])
    .toFile('scratch/current_summer_crosshair.png');

  await sharp('public/assets/icons/icon_dragon_summer_damage.webp')
    .composite([{ input: crossSvg }])
    .toFile('scratch/current_damage_crosshair.png');
}

main().catch(console.error);
