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

// 統計データ集計用
const stats = {
  bgm: { total: 0, converted: 0, skipped: 0, failed: 0 },
  se: { total: 0, converted: 0, skipped: 0, failed: 0 },
  voice: { total: 0, converted: 0, skipped: 0, failed: 0 },
};

function runFFmpeg(args) {
  return new Promise((resolve) => {
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
      await sleep(delay);
    }
  }
}

async function convertDirectory(dirPath, kbps, type) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  const files = fs.readdirSync(dirPath);
  const mp3Files = files.filter((f) => f.toLowerCase().endsWith('.mp3'));
  stats[type].total = mp3Files.length;

  console.log(
    `[Audio] ./${path.relative(projectRoot, dirPath).replace(/\\/g, '/')} 内の処理対象音声数: ${mp3Files.length} 件`
  );

  for (const file of mp3Files) {
    const srcPath = path.join(dirPath, file);

    const isMono = await checkIsMono(srcPath);
    if (isMono) {
      stats[type].skipped++;
      continue;
    }

    const tmpPath = path.join(dirPath, file + '.tmp.mp3');
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
      stats[type].converted++;
    } catch (e) {
      console.error(`[Audio] Failed to convert: ${file}`, e.message);
      stats[type].failed++;
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch {}
      }
    }
  }
}

async function convertWavVoices() {
  const voiceDir = path.join(projectRoot, 'public/assets/audio/voice');
  if (!fs.existsSync(voiceDir)) return;

  const files = fs.readdirSync(voiceDir);
  const wavFiles = files.filter((f) => f.toLowerCase().endsWith('.wav'));
  stats.voice.total = wavFiles.length;

  if (wavFiles.length === 0) return;

  console.log(
    `[Audio] ./public/assets/audio/voice 内の新規WAVボイス数: ${wavFiles.length} 件`
  );

  for (const file of wavFiles) {
    const wavPath = path.join(voiceDir, file);
    const mp3Name = file.substring(0, file.length - 4) + '.mp3';
    const mp3Path = path.join(voiceDir, mp3Name);

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
      stats.voice.converted++;
    } catch (e) {
      console.error(`[Audio] Failed to convert WAV: ${file}`, e);
      stats.voice.failed++;
    }
  }
}

function fixWavReferencesInCode() {
  const filesToFix = [
    path.join(projectRoot, 'src/utils/constants/voices.js'),
    path.join(projectRoot, 'src/utils/sounds.js'),
  ];

  for (const file of filesToFix) {
    if (fs.existsSync(file)) {
      let content = fs.readFileSync(file, 'utf8');
      if (content.includes('.wav')) {
        content = content.replace(/\.wav/g, '.mp3');
        fs.writeFileSync(file, content, 'utf8');
      }
    }
  }
}

async function runAllConversion() {
  console.log('[Audio] 音声アセットのモノラル最適化を開始します...');

  try {
    // 0. 新規 WAV ボイスがあれば MP3 に変換
    await convertWavVoices();

    // 1. すべてのBGM（128kbps）
    const bgmDir = path.join(projectRoot, 'public/assets/audio/bgm');
    await convertDirectory(bgmDir, 128, 'bgm');

    // 2. すべてのSE（128kbps）
    const seDir = path.join(projectRoot, 'public/assets/audio/se');
    await convertDirectory(seDir, 128, 'se');

    // 3. コード内の .wav 参照を .mp3 に自動修正
    fixWavReferencesInCode();

    // 最終サマリー表示
    const totalConverted =
      stats.bgm.converted + stats.se.converted + stats.voice.converted;
    const totalSkipped =
      stats.bgm.skipped + stats.se.skipped + stats.voice.skipped;
    const totalFailed = stats.bgm.failed + stats.se.failed + stats.voice.failed;

    console.log('--- 音声最適化結果サマリー ---');
    console.log(`新規作成/変換: ${totalConverted} 件`);
    console.log(`スキップ（最適化済み）: ${totalSkipped} 件`);
    console.log(`失敗: ${totalFailed} 件`);
  } catch (err) {
    console.error('All Audio Assets Conversion failed:', err);
    process.exit(1);
  }
}

runAllConversion();
