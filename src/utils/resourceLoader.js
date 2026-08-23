import {
  AUDIO_INSTANCES,
  SE_PATHS,
  shouldSkipAudioPreload,
  loadSE,
  loadBgm,
  audioCtx,
  resolveAssetPath,
} from './sounds.js';
import { appendVersionQuery } from './constants/config.js';
import { CHARACTERS, getSkinImage } from './constants/characters.js';
import { VFX_DATA } from './constants/vfx.js';
import { UI_IMAGES } from './constants/uiImages.js';
import { getAllVoicePaths } from './constants/voices.js';
import { STAGES, getStageImgUrl } from './constants/stages.js';
import { PLAYMAT_MASTER, getPlaymatImgUrl } from './constants/playmats.js';
import { AVAILABLE_ICONS, EXTRA_ICONS } from './constants/avatars.js';

let isPreloaded = false;

/**
 * VFX_DATA に定義されているすべての演出用画像URL（スプライトシート・UI等）を取得する
 *
 * @returns {string[]} 全VFX演出用画像URLの配列
 */
export function getAllVfxImageUrls() {
  const urls = new Set();
  Object.values(VFX_DATA).forEach((data) => {
    if (data && data.src) {
      urls.add(appendVersionQuery(data.src));
    }
    if (data && data.type === 'custom_joker') {
      urls.add(appendVersionQuery('assets/ui/ui_joker.png'));
    }
  });
  return Array.from(urls);
}

/**
 * CHARACTERS および各種スキンに定義されているすべてのキャラクター画像URL（立ち絵、アイコン、負け画像）を取得する
 *
 * @returns {string[]} 全キャラクター・スキン画像URLの配列
 */
export function getAllCharacterImageUrls() {
  const urls = new Set();
  Object.values(CHARACTERS).forEach((charObj) => {
    if (!charObj) return;
    if (charObj.image) urls.add(appendVersionQuery(charObj.image));
    if (charObj.imageLose) urls.add(appendVersionQuery(charObj.imageLose));
    if (charObj.icon) urls.add(appendVersionQuery(charObj.icon));

    // 各スキン画像の展開
    if (charObj.skins) {
      Object.keys(charObj.skins).forEach((skinId) => {
        ['image', 'imageLose', 'icon'].forEach((type) => {
          const skinImg = getSkinImage(charObj, skinId, type);
          if (skinImg) urls.add(appendVersionQuery(skinImg));
        });
      });
    }
  });
  return Array.from(urls);
}

/**
 * 指定されたリーダー設定およびスキンに対応する立ち絵・アイコン等の優先プリロード画像URLリストを取得する
 *
 * @param {Object} config - リーダーのキャラクター設定オブジェクト
 * @param {string} [skinId] - 着用スキンID（指定がない場合は default）
 * @returns {string[]} 優先プリロード対象の画像URL配列
 */
export function getLeaderPreloadUrls(config, skinId) {
  if (!config) return [];
  const urls = new Set();

  const selSkin = skinId || 'default';
  const img = getSkinImage(config, selSkin, 'image') || config.image;
  const imgLose =
    getSkinImage(config, selSkin, 'imageLose') ||
    config.imageLose ||
    config.image;
  const icon = getSkinImage(config, selSkin, 'icon') || config.icon;

  if (img) urls.add(appendVersionQuery(img));
  if (imgLose) urls.add(appendVersionQuery(imgLose));
  if (icon) urls.add(appendVersionQuery(icon));

  return Array.from(urls);
}

/**
 * アプリ起動時のゲームリソース一括プリロード処理
 * タイトル画面の初期表示に必要な素材を同期ロードし、残りの素材（カード・キャラ・VFX）を非同期バックグラウンドでロードする
 *
 * @param {Function} [onProgress] - 進捗更新コールバック（0〜100）
 * @returns {Promise<void>}
 */
export async function preloadAllGameResources(onProgress) {
  if (isPreloaded) {
    if (onProgress) onProgress(100);
    return;
  }

  const urlsToLoad = new Set();

  // 1. タイトルなど起動直後に必要な画像・ロゴ
  urlsToLoad.add(appendVersionQuery('assets/ui/title_logo.png'));
  const MAX_TITLE_BGS = 3;
  for (let i = 1; i <= MAX_TITLE_BGS; i++) {
    urlsToLoad.add(
      appendVersionQuery(
        `assets/ui/title_img_${String(i).padStart(3, '0')}.png`
      )
    );
  }

  // 2. メインメニュー表示用UIボタン画像全種およびメイン選択背景
  Object.values(UI_IMAGES).forEach((url) => {
    if (url) urlsToLoad.add(url);
  });
  urlsToLoad.add(
    appendVersionQuery('assets/backgrounds/background_select.webp')
  );
  urlsToLoad.add(appendVersionQuery('assets/ui/ui_btn_watermark.png'));
  urlsToLoad.add(appendVersionQuery('assets/ui/ui_btn_ornament.png'));

  // メニュー共通背景・対戦共通パーツ画像のみバックグラウンドで非同期ロード
  // （※カード画像・キャラ立ち絵・VFXは対戦開始時や画面スクロール時にオンデマンドで読み込むため、起動時の一括メモリ展開を防止）
  const asyncUrlsToLoad = new Set();

  // A. その他のメニュー背景画像
  const extraBackgrounds = [
    'assets/backgrounds/background_online.webp',
    'assets/backgrounds/background_deck.webp',
    'assets/backgrounds/background_gallery.webp',
    'assets/backgrounds/background_story.webp',
    'assets/backgrounds/background_dungeon.webp',
    'assets/backgrounds/background_rules.webp',
  ];
  extraBackgrounds.forEach((bg) => asyncUrlsToLoad.add(appendVersionQuery(bg)));

  // B. 対戦・演出用共通UIパーツ画像
  const extraUiParts = [
    'assets/ui/vs_logo.png',
    'assets/ui/chara_frame.png',
    'assets/ui/ui_card_back.png',
    'assets/ui/packimg01.png',
    'assets/ui/packtextimg01.png',
    'assets/ui/first_player.png',
    'assets/ui/second_player.png',
    'assets/icons/icon_exclamation.webp',
  ];
  extraUiParts.forEach((part) => asyncUrlsToLoad.add(appendVersionQuery(part)));

  // C. キャラクター選択用立ち絵サムネイル画像（起動完了後に静かに事前キャッシュ）
  Object.values(CHARACTERS).forEach((char) => {
    if (char) {
      const defaultThumb = getSkinImage(char, 'default', 'image', true);
      if (defaultThumb) asyncUrlsToLoad.add(defaultThumb);
      if (char.skins) {
        Object.keys(char.skins).forEach((skinKey) => {
          const skinThumb = getSkinImage(char, skinKey, 'image', true);
          if (skinThumb) asyncUrlsToLoad.add(skinThumb);
        });
      }
    }
  });

  // D. ステージ選択用背景サムネイル画像（起動完了後に静かに事前キャッシュ）
  Object.keys(STAGES).forEach((stageId) => {
    if (stageId && stageId !== 'random') {
      const stageThumb = getStageImgUrl(stageId, true);
      if (stageThumb) asyncUrlsToLoad.add(stageThumb);
    }
  });

  // E. プレイマット選択用サムネイル画像（起動完了後に静かに事前キャッシュ）
  PLAYMAT_MASTER.forEach((pm) => {
    if (pm) {
      const pmThumb = getPlaymatImgUrl(pm, true);
      if (pmThumb) asyncUrlsToLoad.add(pmThumb);
    }
  });

  // F. プロフィール・スキン用アイコン画像およびフレーム（起動完了後に静かに事前キャッシュ）
  [...AVAILABLE_ICONS, ...EXTRA_ICONS].forEach((item) => {
    if (item && item.path) {
      asyncUrlsToLoad.add(appendVersionQuery(item.path));
    }
  });
  asyncUrlsToLoad.add(appendVersionQuery('assets/icons/iconframe_gold.webp'));
  asyncUrlsToLoad.add(appendVersionQuery('assets/icons/iconframe_red.webp'));

  // BGM と SE
  Object.values(SE_PATHS).forEach((path) => {
    urlsToLoad.add(path);
  });

  // カードボイス全種（召喚・撃破CV）
  const voicePaths = getAllVoicePaths();
  voicePaths.forEach((path) => {
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
        // SEかカードボイスかBGMかを判定
        const isSE = Object.values(SE_PATHS).includes(url);
        const isVoice = voicePaths.includes(url);
        if (isSE) {
          // 効果音（SE）の場合は Web Audio API で事前デコードしてキャッシュする
          const key = Object.keys(SE_PATHS).find((k) => SE_PATHS[k] === url);
          if (key) {
            loadSE(key, url).then(resolve).catch(resolve);
          } else {
            resolve();
          }
        } else if (isVoice) {
          // 起動時は音声ファイルを fetch してブラウザ/ServiceWorkerキャッシュへ保存（HTTPキャッシュ）するのみとし、
          // RAMへの生PCMデコード展開は対戦開始時（prepareBattle）まで遅延させて起動時常駐メモリを削減する
          fetch(resolveAssetPath(url)).then(resolve).catch(resolve);
        } else {
          // BGM（タイトルBGMなど）の場合は、Web Audio API での事前デコードと HTML5 Audio 双方をロードする
          const bgmKey = Object.keys(AUDIO_INSTANCES).find((k) => {
            const audio = AUDIO_INSTANCES[k];
            if (audio && audio.src) {
              try {
                const pathname = new URL(audio.src, window.location.href)
                  .pathname;
                return pathname === url || audio.src.includes(url);
              } catch {
                return audio.src.includes(url);
              }
            }
            return false;
          });

          const p1 = bgmKey ? loadBgm(bgmKey, url) : Promise.resolve();
          // Web Audio APIが使えない環境（audioCtxがnull）の場合のみ、HTML5 Audioとしてもプリロードする
          const p2 = !audioCtx
            ? new Promise((res) => {
                const a = new Audio();
                a.oncanplaythrough = res;
                a.onerror = res;
                a.src = url;
                a.load();
                preloadedAudios.push(a);
              })
            : Promise.resolve();

          Promise.all([p1, p2]).then(resolve).catch(resolve);
        }
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

  // サーバーのアクセス制限（AccessLimit exceeded）回避のため同時接続数を5に制限
  const concurrencyLimit = 5;
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

  // 起動完了を待たずに非同期でカード画像・キャラ画像・VFX画像をバックグラウンドロード開始
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
    console.log(
      'Background game assets (cards, characters, VFX) preloading completed.'
    );
  };

  // 起動完了の完了報告を妨げないように、非同期処理を待たずに開始させる
  loadAsyncResources().catch((err) => {
    console.error('Failed to preload background game assets:', err);
  });
}
