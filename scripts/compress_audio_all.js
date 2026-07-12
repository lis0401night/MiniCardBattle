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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function runFFmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, (error, stdout, stderr) => {
      if (error) {
        resolve({ stdout, stderr, error });
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

function checkIsMono(filePath) {
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-i', filePath], (error, stdout, stderr) => {
      const output = stderr || stdout || '';
      if (output.toLowerCase().includes('mono')) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

async function safeRename(tmpPath, targetPath, retries = 5, delay = 2000) {
  for (let i = 1; i <= retries; i++) {
    try {
      if (fs.existsSync(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch {}
      }
      fs.renameSync(tmpPath, targetPath);
      return true;
    } catch (e) {
      if (i === retries) {
        throw e;
      }
      console.warn(
        `[Lock Warning] File locked: ${path.basename(targetPath)}. Retrying in ${delay}ms... (Attempt ${i}/${retries})`
      );
      await sleep(delay);
    }
  }
}

async function convertDirectory(dirPath, kbps) {
  if (!fs.existsSync(dirPath)) {
    console.log(`Directory not found: ${dirPath}`);
    return;
  }

  const files = fs.readdirSync(dirPath);
  const mp3Files = files.filter((f) => f.toLowerCase().endsWith('.mp3'));
  console.log(`Found ${mp3Files.length} MP3 files in: ${dirPath}`);

  for (const file of mp3Files) {
    const srcPath = path.join(dirPath, file);

    const isMono = await checkIsMono(srcPath);
    if (isMono) {
      continue;
    }

    const tmpPath = path.join(dirPath, file + '.tmp.mp3');
    console.log(`Converting: ${file} to Mono / 44.1kHz / ${kbps}kbps...`);

    try {
      await runFFmpeg([
        '-y',
        '-i',
        srcPath,
        '-ac',
        '1',
        '-ar',
        '44100',
        '-ab',
        `${kbps}k`,
        tmpPath,
      ]);

      await safeRename(tmpPath, srcPath, 5, 2000);
      console.log(`Successfully converted: ${file}`);
    } catch (e) {
      console.error(
        `Failed to convert: ${file} (File remains locked after retries)`,
        e.message
      );
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {}
      }
    }
  }
}

// 新しく追加された WAV ボイスの一括 MP3 変換 & WAV 削除
async function convertWavVoices() {
  const voiceDir = path.join(projectRoot, 'public/assets/audio/voice');
  if (!fs.existsSync(voiceDir)) return;

  const files = fs.readdirSync(voiceDir);
  const wavFiles = files.filter((f) => f.toLowerCase().endsWith('.wav'));
  if (wavFiles.length === 0) return;

  console.log(`--- Converting ${wavFiles.length} new WAV voice files ---`);
  for (const file of wavFiles) {
    const wavPath = path.join(voiceDir, file);
    const mp3Name = file.substring(0, file.length - 4) + '.mp3';
    const mp3Path = path.join(voiceDir, mp3Name);

    console.log(`Converting WAV -> MP3: ${file}`);
    try {
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
      console.log(`Deleted original WAV: ${file}`);
    } catch (e) {
      console.error(`Failed to convert WAV file: ${file}`, e);
    }
  }
}

// ソースコード内の .wav 参照を .mp3 に自動置換する処理
function fixWavReferencesInCode() {
  const filesToFix = [
    path.join(projectRoot, 'src/utils/constants/voices.js'),
    path.join(projectRoot, 'src/utils/sounds.js'),
  ];

  for (const file of filesToFix) {
    if (fs.existsSync(file)) {
      let content = fs.readFileSync(file, 'utf8');
      if (content.includes('.wav')) {
        console.log(
          `[Code Clean] Replacing .wav references with .mp3 in: ${path.basename(file)}`
        );
        content = content.replace(/\.wav/g, '.mp3');
        fs.writeFileSync(file, content, 'utf8');
      }
    }
  }
}

async function runAllConversion() {
  try {
    // 0. 新規追加された WAV ボイスがあれば MP3 に変換し、元の WAV を削除
    await convertWavVoices();

    // 1. すべてのBGM（128kbps）
    const bgmDir = path.join(projectRoot, 'public/assets/audio/bgm');
    console.log('--- Checking BGM Mono Optimization ---');
    await convertDirectory(bgmDir, 128);

    // 2. すべてのSE（128kbps）
    const seDir = path.join(projectRoot, 'public/assets/audio/se');
    console.log('--- Checking SE Mono Optimization ---');
    await convertDirectory(seDir, 128);

    // 3. コード内の .wav 拡張子の指定を .mp3 に自動修正
    fixWavReferencesInCode();

    console.log('Audio Assets Mono Optimization completed.');
  } catch (err) {
    console.error('All Audio Assets Conversion failed:', err);
    process.exit(1);
  }
}

runAllConversion();
