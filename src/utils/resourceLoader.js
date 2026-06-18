import { CARD_MASTER } from './constants/cards.js';
import { CHARACTERS } from './constants/characters.js';
import { AUDIO_INSTANCES, SE_PATHS } from './sounds.js';

let isPreloaded = false;

export async function preloadAllGameResources(onProgress) {
  if (isPreloaded) {
    if (onProgress) onProgress(100);
    return;
  }

  const urlsToLoad = new Set();

  // タイトルなど起動直後に必要な画像は優先的に入れておく
  urlsToLoad.add('assets/ui/title_img.jpg');

  // カード画像は非同期ロード（裏でゆっくりロードし、起動完了はブロックしない）
  const asyncUrlsToLoad = new Set();
  CARD_MASTER.forEach((card) => {
    if (card.image) asyncUrlsToLoad.add(card.image);
  });

  Object.values(CHARACTERS).forEach((char) => {
    if (char.icon) urlsToLoad.add(char.icon);
    if (char.image) urlsToLoad.add(char.image);
    if (char.imageLose) urlsToLoad.add(char.imageLose);

    if (char.skins) {
      Object.values(char.skins).forEach((skin) => {
        if (skin.icon) urlsToLoad.add(skin.icon);
        if (skin.image) urlsToLoad.add(skin.image);
        if (skin.imageLose) urlsToLoad.add(skin.imageLose);
      });
    }
  });

  // BGM と SE
  Object.values(SE_PATHS).forEach((path) => {
    urlsToLoad.add(path);
  });

  Object.keys(AUDIO_INSTANCES).forEach((key) => {
    // 戦闘用BGM（ステージBGM、通常バトル曲、ラストボス曲、トーナメント戦闘曲）は起動時の同期プリロードから除外
    const isStageOrBattleBgm =
      key.startsWith('bgmStage') ||
      key === 'bgmBattle' ||
      key === 'bgmLastBattle' ||
      key === 'bgmTournament2';

    if (isStageOrBattleBgm) {
      return;
    }

    const audio = AUDIO_INSTANCES[key];
    // audio.src はブラウザによって絶対URLになるため、URLオブジェクトを介してパス名のみを抽出します
    if (audio && audio.src) {
      const url = new URL(audio.src, window.location.href).pathname;
      urlsToLoad.add(url);
    }
  });

  const urlList = Array.from(urlsToLoad);
  const total = urlList.length;
  let loadedCount = 0;

  let preloadedAudios = [];

  const loadPromise = (url) => {
    return new Promise((resolve) => {
      if (url.match(/\.(mp3|wav|ogg|m4a)$/i)) {
        // 音声ファイルのキャッシュ
        const a = new Audio();
        a.oncanplaythrough = resolve;
        a.onerror = resolve;
        a.src = url;
        a.load();
        preloadedAudios.push(a);
      } else {
        // 画像ファイルのキャッシュ
        const img = new Image();
        img.onload = resolve;
        img.onerror = resolve;
        img.src = url;
      }
    }).then(() => {
      loadedCount++;
      if (onProgress) {
        onProgress(Math.floor((loadedCount / total) * 100));
      }
    });
  };

  // 同時接続数制限を入れてロード
  const concurrencyLimit = 15;
  let index = 0;
  const worker = async () => {
    while (index < urlList.length) {
      const url = urlList[index++];
      await loadPromise(url);
    }
  };

  const workers = [];
  for (let i = 0; i < concurrencyLimit; i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  isPreloaded = true;
  preloadedAudios = null;

  // 起動完了を待たずに非同期でカード画像をバックグラウンドロード開始
  const asyncUrlList = Array.from(asyncUrlsToLoad);
  const loadAsyncResources = async () => {
    // 起動完了後にバックグラウンドでゆっくりロードするため、同時接続数を抑える（例: 2並列）
    const asyncConcurrency = 2;
    let asyncIndex = 0;
    const asyncWorker = async () => {
      while (asyncIndex < asyncUrlList.length) {
        const url = asyncUrlList[asyncIndex++];
        await new Promise((resolve) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = resolve;
          img.src = url;
        });
      }
    };
    const asyncWorkers = [];
    for (let i = 0; i < asyncConcurrency; i++) {
      asyncWorkers.push(asyncWorker());
    }
    await Promise.all(asyncWorkers);
    console.log('Background card image preloading completed.');
  };

  // 起動完了の完了報告を妨げないように、非同期処理を待たずに開始させる
  loadAsyncResources().catch((err) => {
    console.error('Failed to preload cards in background:', err);
  });
}
