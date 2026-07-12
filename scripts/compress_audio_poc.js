import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import ffmpegPath from 'ffmpeg-static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

if (!ffmpegPath) {
  console.error('Failed to resolve ffmpeg binary from ffmpeg-static');
  process.exit(1);
}

console.log('Resolved FFmpeg Path:', ffmpegPath);

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, (error, stdout, stderr) => {
      if (error) {
        console.error(`FFmpeg error during execution:`, stderr);
        reject(error);
      } else {
        resolve(stdout);
      }
    });
  });
}

async function runConversion() {
  try {
    // 1. voice内のすべての .wav を .mp3 (モノラル/44.1kHz/128kbps) に一括変換
    const voiceDir = path.join(projectRoot, 'public/assets/audio/voice');
    if (fs.existsSync(voiceDir)) {
      const files = fs.readdirSync(voiceDir);
      const wavFiles = files.filter((f) => f.toLowerCase().endsWith('.wav'));

      console.log(`Found ${wavFiles.length} WAV files in voice directory.`);

      for (const file of wavFiles) {
        const wavPath = path.join(voiceDir, file);
        const mp3Name = file.substring(0, file.length - 4) + '.mp3';
        const mp3Path = path.join(voiceDir, mp3Name);

        console.log(`Converting: ${file} -> ${mp3Name}`);
        await runFFmpeg([
          '-y',
          '-i',
          wavPath,
          '-ac',
          '1',
          '-ar',
          '44100',
          '-ab',
          '128k',
          mp3Path,
        ]);

        fs.unlinkSync(wavPath);
        console.log(`Deleted: ${file}`);
      }
    }

    // 2. タイトルBGMをモノラルに変換
    const bgmPath = path.join(
      projectRoot,
      'public/assets/audio/bgm/bgm_title.mp3'
    );
    const bgmTmpPath = path.join(
      projectRoot,
      'public/assets/audio/bgm/bgm_title_tmp.mp3'
    );

    if (fs.existsSync(bgmPath)) {
      console.log('Converting BGM to mono (128kbps): bgm_title...');
      await runFFmpeg([
        '-y',
        '-i',
        bgmPath,
        '-ac',
        '1',
        '-ar',
        '44100',
        '-ab',
        '128k',
        bgmTmpPath,
      ]);
      fs.renameSync(bgmTmpPath, bgmPath);
      console.log('Successfully converted bgm_title.mp3 to Mono/128kbps');
    }

    console.log('Audio Conversion completed successfully.');
  } catch (err) {
    console.error('Audio Conversion failed:', err);
    process.exit(1);
  }
}

runConversion();
