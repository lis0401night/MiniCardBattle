import { CARD_MASTER } from './constants/cards.js';
import { AUDIO_INSTANCES, SE_PATHS, shouldSkipAudioPreload } from './sounds.js';
import { getCardImgUrl, hasPremiumVariant } from './gameUtils.js';
import { appendVersionQuery } from './constants/config.js';

let isPreloaded = false;

export async function preloadAllGameResources(onProgress) {
  if (isPreloaded) {
    if (onProgress) onProgress(100);
    return;
  }

  const urlsToLoad = new Set();

  // タイトルなど起動直後に必要な画像は優先的に入れておく
  urlsToLoad.add(appendVersionQuery('assets/ui/title_logo.png'));
  const MAX_TITLE_BGS = 3;
  for (let i = 1; i <= MAX_TITLE_BGS; i++) {
    urlsToLoad.add(appendVersionQuery(`assets/ui/title_img_${String(i).padStart(3, '0')}.png`));
  }

  // カード画像は非同期ロード（裏でゆっくりロードし、起動完了はブロックしない）
  const asyncUrlsToLoad = new Set();
  CARD_MASTER.forEach((card) => {
    // 通常版画像
    const normalUrl = getCardImgUrl({ id: card.id, isPremium: false });
    if (normalUrl) asyncUrlsToLoad.add(normalUrl);

    // プレミアム画像（プレミアム版が存在する場合のみ追加）
    if (hasPremiumVariant(card.id)) {
      const premiumUrl = getCardImgUrl({ id: card.id, isPremium: true });
      if (premiumUrl) asyncUrlsToLoad.add(premiumUrl);
    }
  });

  // BGM と SE
  Object.values(SE_PATHS).forEach((path) => {
    urlsToLoad.add(path);
  });

  Object.keys(AUDIO_INSTANCES).forEach((key) => {
    // 起動時に不要な音声は起動時の同期プリロードから除外（必要時にロード）
    if (shouldSkipAudioPreload(key)) {
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
