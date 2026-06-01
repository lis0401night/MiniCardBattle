import { CARD_MASTER } from './constants/cards.js';
import { CHARACTERS } from './constants/characters.js';
import { PLAYMAT_MASTER } from './constants/playmats.js';
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

  CARD_MASTER.forEach((card) => {
    if (card.image) urlsToLoad.add(card.image);
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

  PLAYMAT_MASTER.forEach((pm) => {
    if (pm.image) urlsToLoad.add(pm.image);
  });

  // BGM と SE
  Object.values(SE_PATHS).forEach((path) => {
    urlsToLoad.add(path);
  });

  Object.keys(AUDIO_INSTANCES).forEach((key) => {
    const audio = AUDIO_INSTANCES[key];
    // audio.src はブラウザによっては絶対パスになるため、パス指定文字を含む場合のみ
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
}
