const fs = require('fs');
const readline = require('readline');

async function run() {
  const fileStream = fs.createReadStream('C:\\Users\\owner\\.gemini\\antigravity\\brain\\cc12f942-a81c-4cf2-a3bc-89cf72ec9d1f\\.system_generated\\logs\\transcript.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    const data = JSON.parse(line);
    if (data.type === 'USER_INPUT') {
      console.log(`[Step ${data.step_index}] ${data.created_at}`);
      console.log(data.content);
      console.log('----------------------------------------------------');
    }
  }
}

run();
