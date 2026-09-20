import sharp from 'sharp';

async function main() {
  const boardImg = await sharp('scratch/old_board_dragon_school.png').removeAlpha().raw().toBuffer({ resolveWithObject: true });

  for (let i = 0; i < 5; i++) {
    const testImg = await sharp(`scratch/board_test_${i}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let diff = 0;
    const len = 400 * 200 * 3;
    for (let j = 0; j < len; j++) {
      diff += Math.abs(testImg.data[j] - boardImg.data[j]);
    }
    const avg = diff / (400 * 200 * 3);
    console.log(`Board test ${i}: avg diff = ${avg.toFixed(2)}`);
  }
}

main().catch(console.error);
