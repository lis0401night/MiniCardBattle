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
    // スキンバグに関する全ファイル書き換えツールコールをダンプ
    if (data.step_index >= 0 && data.step_index <= 65) {
      const isReplaceCall = data.type === 'PLANNER_RESPONSE' && data.tool_calls && data.tool_calls.some(tc => tc.name === 'replace_file_content');
      const isCodeAction = data.type === 'CODE_ACTION';
      
      if (isReplaceCall || isCodeAction) {
        console.log(`[Step ${data.step_index}] Source: ${data.source}, Type: ${data.type}`);
        if (data.tool_calls) {
          data.tool_calls.forEach(tc => {
            if (tc.name === 'replace_file_content') {
              console.log(`File: ${tc.args.TargetFile}`);
              console.log(`StartLine: ${tc.args.StartLine}, EndLine: ${tc.args.EndLine}`);
              console.log(`Instruction: ${tc.args.Instruction}`);
              console.log(`Target:`, tc.args.TargetContent);
              console.log(`Replacement:`, tc.args.ReplacementContent);
            }
          });
        }
        if (data.content && isCodeAction) {
          console.log('CodeAction content:', data.content.substring(0, 1000));
        }
        console.log('----------------------------------------------------');
      }
    }
  }
}

run();
