/**
 * Mini Card Battle - Premium Card Animation Maker
 *
 * MP4/WebM動画からカード規格（400x600, 2:3比率）のループアニメーションWebPと
 * サムネイルをブラウザ上で視覚的にトリミング・範囲指定して生成する開発ツール。
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import ToolNavigation from '../common/ToolNavigation.jsx';
import { createAnimatedWebpBlob } from './utils/webpMuxer.js';
import './PremiumCardMaker.css';

/**
 * プレビュービューポートの表示サイズ (2:3 比率)
 */
const VIEWPORT_WIDTH = 320;
const VIEWPORT_HEIGHT = 480;

/**
 * 出力カード画像の標準解像度
 */
const OUTPUT_WIDTH = 400;
const OUTPUT_HEIGHT = 600;

/**
 * 出力サムネイル画像の標準解像度
 */
const THUMB_WIDTH = 200;
const THUMB_HEIGHT = 300;

/**
 * ビューポート全体を満たす最小スケールを算出
 * @param {number} w - 動画幅
 * @param {number} h - 動画高さ
 * @returns {number} 最小スケール
 */
function computeMinScale(w, h) {
  if (!w || !h) return 1.0;
  const scaleX = VIEWPORT_WIDTH / w;
  const scaleY = VIEWPORT_HEIGHT / h;
  return Math.max(scaleX, scaleY);
}

/**
 * 許可される最大スケールを算出
 * @param {number} w - 動画幅
 * @param {number} h - 動画高さ
 * @returns {number} 最大スケール
 */
function computeMaxScale(w, h) {
  return computeMinScale(w, h) * 4.0;
}

/**
 * パン位置およびズーム倍率をビューポート内に収まるようクランプ（枠はみ出し防止）
 * @param {{x: number, y: number}} targetPan - 目的のパン座標
 * @param {number} targetZoom - 目的のズーム倍率
 * @param {number} w - 動画幅
 * @param {number} h - 動画高さ
 * @returns {{pan: {x: number, y: number}, zoom: number}} 補正後のパン座標およびズーム倍率
 */
function clampPanAndZoom(targetPan, targetZoom, w, h) {
  if (!w || !h) return { pan: targetPan, zoom: targetZoom };
  const minScale = computeMinScale(w, h);
  const maxScale = computeMaxScale(w, h);

  const clampedZoom = Math.min(maxScale, Math.max(minScale, targetZoom));
  const scaledW = w * clampedZoom;
  const scaledH = h * clampedZoom;

  // X軸クランプ: 左右に隙間ができないように制限
  const minX = VIEWPORT_WIDTH - scaledW;
  const maxX = 0;
  const clampedX = Math.min(maxX, Math.max(minX, targetPan.x));

  // Y軸クランプ: 上下に隙間ができないように制限
  const minY = VIEWPORT_HEIGHT - scaledH;
  const maxY = 0;
  const clampedY = Math.min(maxY, Math.max(minY, targetPan.y));

  return {
    pan: { x: clampedX, y: clampedY },
    zoom: clampedZoom,
  };
}

export default function PremiumCardMaker() {
  // 動画ファイルおよびメタデータ
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoDims, setVideoDims] = useState({
    width: 0,
    height: 0,
    duration: 0,
  });

  // タイムライン・再生状態
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  /** @type {['seamless', 'pingpong', 'forward']} */
  const [loopMode, setLoopMode] = useState('seamless'); // 'seamless' (シームレス順ループ), 'pingpong' (往復リバース), 'forward' (順方向)
  const [crossfadeDuration, setCrossfadeDuration] = useState(0.4); // シームレスクロスフェード秒数 (0.1 ~ 1.0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0); // 再生速度倍率 (0.25 ~ 3.0)

  // 暗転・フェード設定
  const [fadeEnabled, setFadeEnabled] = useState(false); // 暗転を有効にするか
  const [fadeColor, setFadeColor] = useState('#000000'); // 暗転色
  const [fadeDuration, setFadeDuration] = useState(0.2); // 暗転秒数 (0.05 ~ 1.0)
  const [fadeOpacity, setFadeOpacity] = useState(0); // プレビュー用暗転不透明度 (0 ~ 1)

  // トランスフォーム（トリミング・ズーム・パン）
  const [zoom, setZoom] = useState(1.0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  // 出力設定
  const [cardId, setCardId] = useState('cyborgninja');
  const [fps, setFps] = useState(15);
  const [quality, setQuality] = useState(65);
  const [includeThumbnail, setIncludeThumbnail] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);

  // エンコード進捗・通知
  const [isEncoding, setIsEncoding] = useState(false);
  const [progress, setProgress] = useState({
    current: 0,
    total: 0,
    percent: 0,
  });
  const [statusMessage, setStatusMessage] = useState(null);

  // DOM 参照 & プレビュー描画キャッシュ
  const videoRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const viewportRef = useRef(null);
  const animationFrameRef = useRef(null);
  const frameCacheRef = useRef([]); // 順再生中に蓄積する ImageBitmap キャッシュ
  const lastCaptureTimeRef = useRef(-1);
  const [isReverseMode, setIsReverseMode] = useState(false); // 逆再生描画モードフラグ

  /**
   * 動画ファイル読み込みハンドラ
   * @param {File} file - 選択された動画ファイル
   */
  const handleLoadVideo = useCallback(
    (file) => {
      if (!file || !file.type.startsWith('video/')) {
        setStatusMessage({
          type: 'error',
          text: '有効な動画ファイル（MP4 / WebM等）を選択してください。',
        });
        return;
      }

      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }

      const url = URL.createObjectURL(file);
      setVideoFile(file);
      setVideoUrl(url);
      setIsPlaying(false);
      setStatusMessage(null);

      // ファイル名からカードID候補を自動推測（例: card_cyborgninja_premium.mp4 -> cyborgninja）
      const cleanName = file.name
        .replace(/^card_/, '')
        .replace(/_premium.*$/, '')
        .replace(/\.[^/.]+$/, '');
      if (cleanName) {
        setCardId(cleanName);
      }
    },
    [videoUrl]
  );

  /**
   * 動画メタデータ読み込み完了時の初期化
   */
  const handleVideoLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    const w = video.videoWidth;
    const h = video.videoHeight;
    const dur = video.duration || 0;

    setVideoDims({ width: w, height: h, duration: dur });
    setStartTime(0);
    setEndTime(dur);
    setCurrentTime(0);

    // 初期フィット計算（ビューポートを満たす最小スケール）
    const minScale = computeMinScale(w, h);
    const initialPan = {
      x: (VIEWPORT_WIDTH - w * minScale) / 2,
      y: (VIEWPORT_HEIGHT - h * minScale) / 2,
    };
    const clamped = clampPanAndZoom(initialPan, minScale, w, h);

    setZoom(clamped.zoom);
    setPan(clamped.pan);
  };

  const playbackDirRef = useRef(1); // 1: 順再生, -1: 逆再生
  const virtualTimeRef = useRef(0); // 仮想再生時間
  const lastUiUpdateRef = useRef(0); // UI更新スロットル

  /**
   * フレームキャッシュの全解放とクリア
   */
  const clearFrameCache = () => {
    if (frameCacheRef.current && frameCacheRef.current.length > 0) {
      frameCacheRef.current.forEach((item) => {
        if (item.bitmap && typeof item.bitmap.close === 'function') {
          try {
            item.bitmap.close();
          } catch {
            // エラー無視
          }
        }
      });
      frameCacheRef.current = [];
    }
    lastCaptureTimeRef.current = -1;
  };

  /**
   * 順再生中のフレームを非同期で高速キャッシュ（ImageBitmap）
   * @param {HTMLVideoElement} video - ビデオ要素
   * @param {number} curTime - 現在時刻
   */
  const captureFrameForCache = async (video, curTime) => {
    if (!video || video.videoWidth === 0) return;
    if (Math.abs(curTime - lastCaptureTimeRef.current) >= 0.02) {
      lastCaptureTimeRef.current = curTime;
      try {
        const bitmap = await createImageBitmap(video);
        frameCacheRef.current.push({ time: curTime, bitmap });
        if (frameCacheRef.current.length > 400) {
          const old = frameCacheRef.current.shift();
          if (old && old.bitmap && typeof old.bitmap.close === 'function') {
            try {
              old.bitmap.close();
            } catch {
              // エラー無視
            }
          }
        }
      } catch {
        // エラー無視
      }
    }
  };

  /**
   * 逆再生時にキャッシュ済みフレームを Canvas に直接 60fps 描画
   * @param {number} targetTime - 描画対象時刻
   */
  const renderReverseFrame = (targetTime) => {
    const canvas = previewCanvasRef.current;
    const cache = frameCacheRef.current;
    if (!canvas || cache.length === 0) return false;

    let bestFrame = null;
    let minDiff = Infinity;
    for (let i = cache.length - 1; i >= 0; i--) {
      const diff = Math.abs(cache[i].time - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        bestFrame = cache[i];
      }
      if (diff < 0.015) break;
    }

    if (bestFrame && bestFrame.bitmap) {
      const ctx = canvas.getContext('2d');
      if (
        canvas.width !== bestFrame.bitmap.width ||
        canvas.height !== bestFrame.bitmap.height
      ) {
        canvas.width = bestFrame.bitmap.width;
        canvas.height = bestFrame.bitmap.height;
      }
      ctx.drawImage(bestFrame.bitmap, 0, 0);
      return true;
    }
    return false;
  };

  /**
   * 再生・停止トグル
   */
  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
      setIsReverseMode(false);
      setFadeOpacity(0);
    } else {
      playbackDirRef.current = 1;
      setIsReverseMode(false);
      video.playbackRate = playbackSpeed;
      let startPos = video.currentTime;
      if (startPos >= endTime || startPos < startTime) {
        startPos = startTime;
        video.currentTime = startPos;
        clearFrameCache();
      }
      virtualTimeRef.current = startPos;
      setCurrentTime(startPos);
      setFadeOpacity(0);
      video
        .play()
        .then(() => setIsPlaying(true))
        .catch((e) => console.warn(e));
    }
  };

  /**
   * 再生速度変更時の同期
   */
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  /**
   * ループ再生（順方向 / 往復リバース）およびタイムライン同期のためのフレームループ
   */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let lastFrameTimestamp = performance.now();

    /**
     * 停止位置または動画末尾到達時のループ移行処理
     */
    const triggerLoop = () => {
      if (loopMode === 'pingpong') {
        // 往復リバース: 停止位置から即座に逆再生モードへ移行（Canvas描画）
        playbackDirRef.current = -1;
        setIsReverseMode(true);
        video.pause();
        const safeEnd = Math.min(endTime, video.duration || endTime);
        virtualTimeRef.current = safeEnd;
        renderReverseFrame(safeEnd);
        setCurrentTime(safeEnd);
      } else {
        // 順ループ: 開始位置に戻して再生継続
        playbackDirRef.current = 1;
        setIsReverseMode(false);
        virtualTimeRef.current = startTime;
        video.currentTime = startTime;
        setCurrentTime(startTime);
        video.play().catch(() => {});
      }
    };

    const checkTime = (now) => {
      if (!video) return;
      const dt = Math.min(0.1, (now - lastFrameTimestamp) / 1000);
      lastFrameTimestamp = now;

      if (isPlaying) {
        if (playbackDirRef.current === 1) {
          // --- 順方向再生中 ---
          virtualTimeRef.current = video.currentTime;
          setIsReverseMode(false);

          // フレームをバックグラウンドで高速キャッシュ
          captureFrameForCache(video, video.currentTime);

          // 暗転オーバーレイ不透明度（末尾付近でフェード）
          if (fadeEnabled && fadeDuration > 0) {
            const rem = endTime - video.currentTime;
            if (rem <= fadeDuration && rem >= 0) {
              setFadeOpacity(Math.min(1, Math.max(0, 1 - rem / fadeDuration)));
            } else {
              setFadeOpacity(0);
            }
          } else {
            setFadeOpacity(0);
          }

          // UI更新のスロットル（50ms毎）
          if (now - lastUiUpdateRef.current > 50) {
            lastUiUpdateRef.current = now;
            setCurrentTime(video.currentTime);
          }

          if (video.currentTime >= endTime || video.ended) {
            triggerLoop();
          } else if (video.paused && !video.seeking) {
            video.play().catch(() => {});
          }
        } else {
          // --- 逆再生中 (pingpongモード): キャッシュから 60fps シルキー描画 ---
          virtualTimeRef.current -= dt * playbackSpeed;
          renderReverseFrame(virtualTimeRef.current);

          // 暗転オーバーレイ不透明度（開始位置付近でフェード）
          if (fadeEnabled && fadeDuration > 0) {
            const rem = virtualTimeRef.current - startTime;
            if (rem <= fadeDuration && rem >= 0) {
              setFadeOpacity(Math.min(1, Math.max(0, 1 - rem / fadeDuration)));
            } else {
              setFadeOpacity(0);
            }
          } else {
            setFadeOpacity(0);
          }

          // UI更新のスロットル（50ms毎）
          if (now - lastUiUpdateRef.current > 50) {
            lastUiUpdateRef.current = now;
            setCurrentTime(virtualTimeRef.current);
          }

          if (virtualTimeRef.current <= startTime) {
            // 開始位置に到達: 順再生に即座に戻す
            playbackDirRef.current = 1;
            setIsReverseMode(false);
            virtualTimeRef.current = startTime;
            video.currentTime = startTime;
            setCurrentTime(startTime);
            setFadeOpacity(0);
            video.play().catch(() => {});
          }
        }
      } else {
        virtualTimeRef.current = video.currentTime;
        setCurrentTime(video.currentTime);
        setFadeOpacity(0);
      }

      animationFrameRef.current = requestAnimationFrame(checkTime);
    };

    animationFrameRef.current = requestAnimationFrame(checkTime);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    isPlaying,
    loopMode,
    playbackSpeed,
    fadeEnabled,
    fadeDuration,
    startTime,
    endTime,
  ]);

  /**
   * 特定の再生時刻へシーク
   * @param {number} t - シーク先時刻（秒）
   */
  const seekTo = (t) => {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.max(0, Math.min(t, videoDims.duration));
    video.currentTime = clamped;
    virtualTimeRef.current = clamped;
    setCurrentTime(clamped);
    setIsReverseMode(false);
    clearFrameCache();
  };

  /**
   * コマ送り / コマ戻し
   * @param {number} deltaFrames - フレーム増減数
   */
  const stepFrame = (deltaFrames) => {
    const frameDuration = 1 / fps;
    seekTo(currentTime + deltaFrames * frameDuration);
  };

  /**
   * パン操作（ドラッグ移動）イベントハンドラ
   */
  const handleMouseDown = (e) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = useCallback(
    (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const nextPan = {
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      };
      const clamped = clampPanAndZoom(
        nextPan,
        zoom,
        videoDims.width,
        videoDims.height
      );
      setPan(clamped.pan);
    },
    [isDragging, zoom, videoDims.width, videoDims.height]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  /**
   * ホイール操作によるズーム（ビューポート中心基準 & 枠はみ出し防止）
   */
  const handleWheel = (e) => {
    e.preventDefault();
    if (!videoDims.width || !videoDims.height) return;

    const zoomFactor = e.deltaY < 0 ? 1.05 : 0.95;
    const targetZoom = zoom * zoomFactor;

    // ビューポート中心を基準にズーム
    const cx = VIEWPORT_WIDTH / 2;
    const cy = VIEWPORT_HEIGHT / 2;
    const scaleRatio = targetZoom / zoom;
    const targetPan = {
      x: cx - (cx - pan.x) * scaleRatio,
      y: cy - (cy - pan.y) * scaleRatio,
    };

    const clamped = clampPanAndZoom(
      targetPan,
      targetZoom,
      videoDims.width,
      videoDims.height
    );
    setZoom(clamped.zoom);
    setPan(clamped.pan);
  };

  /**
   * 構図プリセット適用（クランプ補正付き）
   * @param {'center' | 'top_right' | 'top' | 'reset'} preset - プリセット種別
   */
  const applyPreset = (preset) => {
    if (!videoDims.width || !videoDims.height) return;

    const w = videoDims.width;
    const h = videoDims.height;
    const minScale = computeMinScale(w, h);

    if (preset === 'center') {
      const z = minScale;
      const targetPan = {
        x: (VIEWPORT_WIDTH - w * z) / 2,
        y: (VIEWPORT_HEIGHT - h * z) / 2,
      };
      const clamped = clampPanAndZoom(targetPan, z, w, h);
      setZoom(clamped.zoom);
      setPan(clamped.pan);
    } else if (preset === 'top_right') {
      // 右上優先（右端 & 上端揃え・適度なズーム）
      const z = minScale * 1.15;
      const targetPan = {
        x: VIEWPORT_WIDTH - w * z,
        y: 0,
      };
      const clamped = clampPanAndZoom(targetPan, z, w, h);
      setZoom(clamped.zoom);
      setPan(clamped.pan);
    } else if (preset === 'top') {
      const z = minScale;
      const targetPan = {
        x: (VIEWPORT_WIDTH - w * z) / 2,
        y: 0,
      };
      const clamped = clampPanAndZoom(targetPan, z, w, h);
      setZoom(clamped.zoom);
      setPan(clamped.pan);
    } else if (preset === 'reset') {
      const z = minScale;
      const targetPan = {
        x: (VIEWPORT_WIDTH - w * z) / 2,
        y: (VIEWPORT_HEIGHT - h * z) / 2,
      };
      const clamped = clampPanAndZoom(targetPan, z, w, h);
      setZoom(clamped.zoom);
      setPan(clamped.pan);
    }
  };

  /**
   * 動画から指定時刻のフレームを Canvas にレンダリングして取得
   * @param {HTMLVideoElement} video - ビデオ要素
   * @param {number} targetTime - 抽出時刻
   * @param {number} outW - 出力幅
   * @param {number} outH - 出力高さ
   * @returns {Promise<HTMLCanvasElement>} レンダリング済み Canvas
   */
  const captureFrameAtTime = (video, targetTime, outW, outH) => {
    return new Promise((resolve) => {
      let isDone = false;
      const onSeeked = () => {
        if (isDone) return;
        isDone = true;
        video.removeEventListener('seeked', onSeeked);

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');

        // ビューポート基準の pan/zoom を出力解像度基準にスケーリング
        const scaleRatio = outW / VIEWPORT_WIDTH;
        const renderScale = zoom * scaleRatio;
        const renderX = pan.x * scaleRatio;
        const renderY = pan.y * scaleRatio;

        ctx.drawImage(
          video,
          renderX,
          renderY,
          videoDims.width * renderScale,
          videoDims.height * renderScale
        );
        resolve(canvas);
      };

      video.addEventListener('seeked', onSeeked);
      video.currentTime = targetTime;
      // タイムアウト保護
      setTimeout(() => {
        if (!isDone) {
          isDone = true;
          video.removeEventListener('seeked', onSeeked);
          const canvas = document.createElement('canvas');
          canvas.width = outW;
          canvas.height = outH;
          resolve(canvas);
        }
      }, 1500);
    });
  };

  /**
   * WebP アニメーションの書き出し実行
   */
  const handleExport = async () => {
    if (!videoUrl || !videoDims.duration) {
      setStatusMessage({ type: 'error', text: '動画が読み込まれていません。' });
      return;
    }

    const duration = Math.max(0.1, endTime - startTime);
    const frameInterval = (1 / fps) * playbackSpeed;
    const totalFrames = Math.max(1, Math.floor(duration / frameInterval));

    setIsEncoding(true);
    setStatusMessage(null);
    setProgress({ current: 0, total: totalFrames, percent: 0 });

    try {
      // フレーム抽出用の非表示ビデオ要素
      const hiddenVideo = document.createElement('video');
      hiddenVideo.muted = true;
      hiddenVideo.playsInline = true;
      hiddenVideo.src = videoUrl;

      await new Promise((res, rej) => {
        hiddenVideo.onloadedmetadata = () => res();
        hiddenVideo.onerror = (e) => rej(e);
      });

      const forwardFrames = [];
      const thumbFrames = [];

      // 1. 各フレームを順次抽出（再生速度を反映したサンプリング）
      for (let i = 0; i < totalFrames; i++) {
        const frameTime = startTime + i * frameInterval;
        const frameCanvas = await captureFrameAtTime(
          hiddenVideo,
          frameTime,
          OUTPUT_WIDTH,
          OUTPUT_HEIGHT
        );
        forwardFrames.push({
          canvas: frameCanvas,
          durationMs: Math.round(1000 / fps),
        });

        // サムネイル用フレーム (200x300) をメインフレームから高速リサイズ縮小
        if (includeThumbnail) {
          const thumbCanvas = document.createElement('canvas');
          thumbCanvas.width = THUMB_WIDTH;
          thumbCanvas.height = THUMB_HEIGHT;
          const thumbCtx = thumbCanvas.getContext('2d');
          thumbCtx.drawImage(frameCanvas, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
          thumbFrames.push({
            canvas: thumbCanvas,
            durationMs: Math.round(1000 / fps),
          });
        }

        const pct = Math.round(((i + 1) / totalFrames) * 45); // 抽出工程: 45%
        setProgress({ current: i + 1, total: totalFrames, percent: pct });
      }

      // 2. ループモードに応じたフレームシーケンス構築
      let finalFrames = forwardFrames;
      let finalThumbFrames = thumbFrames;

      if (loopMode === 'pingpong' && forwardFrames.length > 2) {
        // 停止地点から逆再生して最初に戻すフレーム群を連結（端点の重複フレームを除去）
        const reverseFrames = forwardFrames.slice(1, -1).reverse();
        finalFrames = [...forwardFrames, ...reverseFrames];

        if (includeThumbnail) {
          const reverseThumbFrames = thumbFrames.slice(1, -1).reverse();
          finalThumbFrames = [...thumbFrames, ...reverseThumbFrames];
        }
      } else if (loopMode === 'seamless' && forwardFrames.length > 3) {
        // シームレス順ループ: 末尾数フレームを先頭フレームへ向けて滑らかにクロスフェード合成
        const fadeFrameCount = Math.max(
          2,
          Math.min(
            Math.round(crossfadeDuration * fps),
            Math.floor(forwardFrames.length / 2)
          )
        );

        /**
         * フレーム配列の末尾に先頭フレームとのクロスフェードを適用
         * @param {Array<{canvas: HTMLCanvasElement, durationMs: number}>} framesList
         * @param {number} w 幅
         * @param {number} h 高さ
         */
        const applySeamlessCrossfade = (framesList, w, h) => {
          const firstCanvas = framesList[0].canvas;
          const count = Math.min(fadeFrameCount, framesList.length - 1);
          const startIndex = framesList.length - count;

          for (let k = 0; k < count; k++) {
            const idx = startIndex + k;
            const alpha = (k + 1) / (count + 1); // 0.16 -> 0.33 -> 0.50 -> ...
            const srcCanvas = framesList[idx].canvas;

            const blendedCanvas = document.createElement('canvas');
            blendedCanvas.width = w;
            blendedCanvas.height = h;
            const ctx = blendedCanvas.getContext('2d');

            // 元フレーム描画
            ctx.drawImage(srcCanvas, 0, 0);
            // 先頭フレームをアルファブレンド合成
            ctx.globalAlpha = alpha;
            ctx.drawImage(firstCanvas, 0, 0);
            ctx.globalAlpha = 1.0;

            framesList[idx].canvas = blendedCanvas;
          }
        };

        applySeamlessCrossfade(finalFrames, OUTPUT_WIDTH, OUTPUT_HEIGHT);
        if (includeThumbnail) {
          applySeamlessCrossfade(finalThumbFrames, THUMB_WIDTH, THUMB_HEIGHT);
        }
      }

      // 3. 暗転・フェード演出の適用
      if (fadeEnabled && fadeDuration > 0) {
        const fadeFrameCount = Math.max(1, Math.round(fadeDuration * fps));

        /**
         * フレーム配列の末尾に指定色のフェードアウト効果および暗転フレームを付与
         * @param {Array<{canvas: HTMLCanvasElement, durationMs: number}>} framesList
         * @param {number} w 幅
         * @param {number} h 高さ
         */
        const applyFadeToFrames = (framesList, w, h) => {
          const count = Math.min(fadeFrameCount, framesList.length);
          const startIndex = framesList.length - count;

          for (let k = 0; k < count; k++) {
            const idx = startIndex + k;
            const alpha = (k + 1) / (count + 1);
            const srcCanvas = framesList[idx].canvas;

            const fadedCanvas = document.createElement('canvas');
            fadedCanvas.width = w;
            fadedCanvas.height = h;
            const ctx = fadedCanvas.getContext('2d');
            ctx.drawImage(srcCanvas, 0, 0);
            ctx.fillStyle = fadeColor;
            ctx.globalAlpha = alpha;
            ctx.fillRect(0, 0, w, h);

            framesList[idx].canvas = fadedCanvas;
          }

          // 完全暗転（指定色）のホールドフレームを 1 コマ追加
          const solidCanvas = document.createElement('canvas');
          solidCanvas.width = w;
          solidCanvas.height = h;
          const solidCtx = solidCanvas.getContext('2d');
          solidCtx.fillStyle = fadeColor;
          solidCtx.fillRect(0, 0, w, h);
          framesList.push({
            canvas: solidCanvas,
            durationMs: Math.round(1000 / fps),
          });
        };

        applyFadeToFrames(finalFrames, OUTPUT_WIDTH, OUTPUT_HEIGHT);
        if (includeThumbnail) {
          applyFadeToFrames(finalThumbFrames, THUMB_WIDTH, THUMB_HEIGHT);
        }
      }

      // 4. メイン WebP アニメーション Muxing（常時無限ループ: loopCount = 0）
      const webpBlob = await createAnimatedWebpBlob(finalFrames, {
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        fps,
        loopCount: 0,
        quality: quality / 100,
        onProgress: (cur, tot) => {
          const pct = 50 + Math.round((cur / tot) * 30); // メインMuxing工程: 30%
          setProgress({ current: cur, total: tot, percent: pct });
        },
      });

      // 5. ダウンロード実行 (メイン WebP)
      const downloadFileName = `card_${cardId || 'card'}_premium.webp`;
      downloadBlob(webpBlob, downloadFileName);

      // 6. アニメーションサムネイル WebP の Muxing & ダウンロード (指定時)
      if (includeThumbnail && finalThumbFrames.length > 0) {
        const thumbBlob = await createAnimatedWebpBlob(finalThumbFrames, {
          width: THUMB_WIDTH,
          height: THUMB_HEIGHT,
          fps,
          loopCount: 0,
          quality: 0.85,
          onProgress: (cur, tot) => {
            const pct = 80 + Math.round((cur / tot) * 20); // サムネイルMuxing工程: 20%
            setProgress({ current: cur, total: tot, percent: pct });
          },
        });
        const thumbName = `card_${cardId || 'card'}_premium_thumb.webp`;
        setTimeout(() => downloadBlob(thumbBlob, thumbName), 300);
      }

      const loopLabel =
        loopMode === 'seamless'
          ? 'シームレス順'
          : loopMode === 'pingpong'
            ? '往復リバース'
            : '通常順方向';
      const speedLabel = playbackSpeed !== 1.0 ? ` (${playbackSpeed}x)` : '';
      const fadeLabel = fadeEnabled ? ` + 暗転(${fadeDuration}s)` : '';
      setStatusMessage({
        type: 'success',
        text: `書き出し完了（${loopLabel}ループ${speedLabel}${fadeLabel}）！ サイズ: ${(webpBlob.size / (1024 * 1024)).toFixed(2)} MB (${finalFrames.length} フレーム)`,
      });
    } catch (err) {
      console.error('WebP Export failed:', err);
      setStatusMessage({
        type: 'error',
        text: `書き出し中にエラーが発生しました: ${err.message}`,
      });
    } finally {
      setIsEncoding(false);
    }
  };

  /**
   * Blob をファイルとしてブラウザからダウンロードさせるヘルパー
   * @param {Blob} blob - 対象 Blob
   * @param {string} fileName - ダウンロードファイル名
   */
  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 1000);
  };

  /**
   * 同等設定の ffmpeg コマンド文字列を生成してクリップボードにコピー
   */
  const copyFfmpegCommand = () => {
    if (!videoDims.width || !videoDims.height) return;

    // ビューポート基準のパン・ズームから、元動画ピクセル座標系での crop パラメータを算出
    const scaleRatio = videoDims.width / (videoDims.width * zoom);
    const cropW = Math.round(VIEWPORT_WIDTH * scaleRatio);
    const cropH = Math.round(VIEWPORT_HEIGHT * scaleRatio);
    const cropX = Math.max(0, Math.round(-pan.x * scaleRatio));
    const cropY = Math.max(0, Math.round(-pan.y * scaleRatio));

    const speedFilter =
      playbackSpeed !== 1.0
        ? `,setpts=${(1 / playbackSpeed).toFixed(3)}*PTS`
        : '';
    let cmd = '';
    if (loopMode === 'pingpong') {
      cmd = `ffmpeg -y -ss ${startTime.toFixed(2)} -to ${endTime.toFixed(2)} -i "public/assets/cards/card_${cardId}_premium.mp4" -filter_complex "[0:v]crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}${speedFilter},fps=${fps}[fwd];[fwd]split[f1][f2];[f2]reverse[rev];[f1][rev]concat=n=2:v=1[out]" -map "[out]" -quality ${quality} -loop 0 "public/assets/cards/card_${cardId}_premium.webp"`;
    } else {
      cmd = `ffmpeg -y -ss ${startTime.toFixed(2)} -to ${endTime.toFixed(2)} -i "public/assets/cards/card_${cardId}_premium.mp4" -vf "crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${OUTPUT_WIDTH}:${OUTPUT_HEIGHT}${speedFilter},fps=${fps}" -quality ${quality} -loop 0 "public/assets/cards/card_${cardId}_premium.webp"`;
    }

    navigator.clipboard.writeText(cmd).then(() => {
      setStatusMessage({
        type: 'success',
        text: 'ffmpeg コマンドをクリップボードにコピーしました！',
      });
    });
  };

  return (
    <div className="pcm-container">
      {/* ヘッダー */}
      <header className="pcm-header">
        <div className="pcm-header-title">
          <span className="icon">🎬</span>
          <span>プレミアムカード作成ツール</span>
          <span className="pcm-header-desc">
            MP4 トリミング & WebP アニメーション変換
          </span>
        </div>
        <ToolNavigation currentToolId="premium_card_maker" />
      </header>

      {/* メインエリア */}
      <div className="pcm-main">
        {/* 左側: プレビュー & トリミングビューポート */}
        <section className="pcm-preview-section">
          <div className="pcm-viewport-wrapper">
            <div
              ref={viewportRef}
              className="pcm-crop-viewport"
              onMouseDown={handleMouseDown}
              onWheel={handleWheel}
              title="ドラッグで位置調整、ホイールで拡大縮小"
            >
              {videoUrl && (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="pcm-video-layer"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    width: videoDims.width ? `${videoDims.width}px` : 'auto',
                    height: videoDims.height ? `${videoDims.height}px` : 'auto',
                  }}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  onEnded={() => {
                    if (isPlaying && videoRef.current) {
                      if (loopMode === 'pingpong') {
                        playbackDirRef.current = -1;
                        videoRef.current.pause();
                        const safeEnd = Math.min(
                          endTime,
                          videoDims.duration || endTime
                        );
                        virtualTimeRef.current = safeEnd;
                        videoRef.current.currentTime = safeEnd;
                        setCurrentTime(safeEnd);
                      } else {
                        playbackDirRef.current = 1;
                        virtualTimeRef.current = startTime;
                        videoRef.current.currentTime = startTime;
                        setCurrentTime(startTime);
                        videoRef.current.play().catch(() => {});
                      }
                    }
                  }}
                  muted
                  playsInline
                />
              )}

              {/* 逆再生用シルキーフレーム描画 Canvas */}
              <canvas
                ref={previewCanvasRef}
                className="pcm-video-layer"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  width: videoDims.width ? `${videoDims.width}px` : 'auto',
                  height: videoDims.height ? `${videoDims.height}px` : 'auto',
                  display: isReverseMode ? 'block' : 'none',
                  pointerEvents: 'none',
                }}
              />

              {/* 暗転オーバーレイ（プレビュー用） */}
              {fadeEnabled && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: fadeColor,
                    opacity: fadeOpacity,
                    pointerEvents: 'none',
                    zIndex: 9,
                    transition: 'opacity 0.05s linear',
                  }}
                />
              )}

              {/* カード外枠・ガイドオーバーレイ */}
              {showOverlay && (
                <div className="pcm-card-overlay">
                  <div className="pcm-card-overlay-grid" />
                  <div className="pcm-card-overlay-badge">
                    PREMIUM (400×600)
                  </div>
                  <div className="pcm-card-overlay-info">
                    <strong>card_{cardId || 'preview'}_premium</strong>
                  </div>
                </div>
              )}
            </div>

            {/* プレビュー下部ツールバー */}
            <div className="pcm-preview-toolbar">
              <span
                style={{
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  marginRight: '4px',
                }}
              >
                構図:
              </span>
              <button
                className="pcm-btn-mini"
                onClick={() => applyPreset('top_right')}
              >
                ↗ 右上優先
              </button>
              <button
                className="pcm-btn-mini"
                onClick={() => applyPreset('center')}
              >
                ⏺ 中央
              </button>
              <button
                className="pcm-btn-mini"
                onClick={() => applyPreset('top')}
              >
                ⬆ 上端
              </button>
              <button
                className="pcm-btn-mini"
                onClick={() => applyPreset('reset')}
              >
                🔄 リセット
              </button>
              <div
                style={{
                  width: '1px',
                  height: '16px',
                  background: '#475569',
                  margin: '0 4px',
                }}
              />
              <button
                className={`pcm-btn-mini ${showOverlay ? 'active' : ''}`}
                onClick={() => setShowOverlay(!showOverlay)}
              >
                📐 ガイド
              </button>
            </div>
          </div>
        </section>

        {/* 右側: コントロールパネル */}
        <aside className="pcm-control-section">
          {/* 1. ファイル読み込み */}
          <div className="pcm-panel">
            <div className="pcm-panel-title">📁 動画読み込み</div>
            <div
              className="pcm-dropzone"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'video/mp4,video/webm,video/*';
                input.onchange = (e) => handleLoadVideo(e.target.files[0]);
                input.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add('dragover');
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('dragover');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove('dragover');
                handleLoadVideo(e.dataTransfer.files[0]);
              }}
            >
              <div className="pcm-dropzone-icon">📹</div>
              <div className="pcm-dropzone-text">
                {videoFile
                  ? videoFile.name
                  : 'MP4 / WebM 動画をドラッグ＆ドロップ'}
              </div>
              <div className="pcm-dropzone-subtext">
                またはクリックしてファイルを選択
              </div>
            </div>
          </div>

          {/* 2. タイムライン・再生 & 範囲指定 */}
          <div className="pcm-panel">
            <div className="pcm-panel-title">⏱ タイムライン & 再生設定</div>
            <div className="pcm-timeline-box">
              <div className="pcm-timeline-playback">
                <div className="pcm-time-display">
                  {currentTime.toFixed(2)}s / {videoDims.duration.toFixed(2)}s
                </div>
                <div className="pcm-playback-btns">
                  <button
                    className="pcm-btn-icon"
                    onClick={() => stepFrame(-1)}
                    title="1コマ戻る"
                  >
                    ⏮
                  </button>
                  <button
                    className={`pcm-btn-icon primary`}
                    onClick={togglePlay}
                    title={isPlaying ? '一時停止' : '再生'}
                  >
                    {isPlaying ? '⏸' : '▶'}
                  </button>
                  <button
                    className="pcm-btn-icon"
                    onClick={() => stepFrame(1)}
                    title="1コマ進む"
                  >
                    ⏭
                  </button>
                </div>
              </div>

              {/* シークバー */}
              <input
                type="range"
                className="pcm-seekbar"
                min="0"
                max={videoDims.duration || 1}
                step="0.01"
                value={currentTime}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
              />

              {/* 開始・停止位置コントロール */}
              <div className="pcm-range-controls">
                <div className="pcm-range-card">
                  <div className="pcm-range-header">
                    <span>開始位置 (Start)</span>
                    <button
                      className="pcm-btn-mini"
                      onClick={() => {
                        setStartTime(currentTime);
                        clearFrameCache();
                      }}
                      title="現在の再生位置を開始位置に設定"
                    >
                      現在値
                    </button>
                  </div>
                  <div className="pcm-range-input-wrap">
                    <input
                      type="number"
                      className="pcm-range-input"
                      min="0"
                      max={endTime}
                      step="0.01"
                      value={Number(startTime.toFixed(2))}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          const clamped = Math.max(0, Math.min(val, endTime));
                          setStartTime(clamped);
                          clearFrameCache();
                        }
                      }}
                    />
                    <span className="pcm-range-unit">秒 (s)</span>
                  </div>
                  <input
                    type="range"
                    className="pcm-seekbar"
                    min="0"
                    max={endTime}
                    step="0.01"
                    value={startTime}
                    onChange={(e) => {
                      setStartTime(parseFloat(e.target.value));
                      clearFrameCache();
                    }}
                  />
                </div>

                <div className="pcm-range-card">
                  <div className="pcm-range-header">
                    <span>停止位置 (End)</span>
                    <button
                      className="pcm-btn-mini"
                      onClick={() => {
                        setEndTime(currentTime);
                        clearFrameCache();
                      }}
                      title="現在の再生位置を停止位置に設定"
                    >
                      現在値
                    </button>
                  </div>
                  <div className="pcm-range-input-wrap">
                    <input
                      type="number"
                      className="pcm-range-input"
                      min={startTime}
                      max={videoDims.duration || 1}
                      step="0.01"
                      value={Number(endTime.toFixed(2))}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val)) {
                          const maxDur = videoDims.duration || 999;
                          const clamped = Math.max(
                            startTime,
                            Math.min(val, maxDur)
                          );
                          setEndTime(clamped);
                          clearFrameCache();
                        }
                      }}
                    />
                    <span className="pcm-range-unit">秒 (s)</span>
                  </div>
                  <input
                    type="range"
                    className="pcm-seekbar"
                    min={startTime}
                    max={videoDims.duration || 1}
                    step="0.01"
                    value={endTime}
                    onChange={(e) => {
                      setEndTime(parseFloat(e.target.value));
                      clearFrameCache();
                    }}
                  />
                </div>
              </div>

              {/* 再生速度設定 */}
              <div
                style={{
                  marginTop: '14px',
                  paddingTop: '10px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '6px',
                  }}
                >
                  <label className="pcm-form-label" style={{ margin: 0 }}>
                    ⚡ 再生・アニメーション速度
                  </label>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      color: '#60a5fa',
                      fontWeight: 'bold',
                    }}
                  >
                    {playbackSpeed.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  className="pcm-seekbar"
                  min="0.25"
                  max="2.5"
                  step="0.05"
                  value={playbackSpeed}
                  onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                />
                <div
                  style={{
                    display: 'flex',
                    gap: '4px',
                    marginTop: '6px',
                    flexWrap: 'wrap',
                  }}
                >
                  {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((spd) => (
                    <button
                      key={spd}
                      className={`pcm-btn-mini ${playbackSpeed === spd ? 'active' : ''}`}
                      onClick={() => setPlaybackSpeed(spd)}
                      style={{
                        flex: '1 0 auto',
                        minWidth: '42px',
                        padding: '3px 6px',
                      }}
                    >
                      {spd === 1.0 ? '1.0x (標準)' : `${spd}x`}
                    </button>
                  ))}
                </div>
              </div>

              {/* ループモード選択 */}
              <div
                style={{
                  marginTop: '14px',
                  paddingTop: '10px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <label
                  className="pcm-form-label"
                  style={{ marginBottom: '6px' }}
                >
                  🔁 ループ方式
                </label>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background:
                        loopMode === 'seamless'
                          ? 'rgba(59, 130, 246, 0.15)'
                          : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${loopMode === 'seamless' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'}`,
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    <input
                      type="radio"
                      name="loopMode"
                      value="seamless"
                      checked={loopMode === 'seamless'}
                      onChange={() => setLoopMode('seamless')}
                    />
                    <div>
                      <strong style={{ color: '#60a5fa' }}>
                        ✨ シームレス順ループ（クロスフェード推奨）
                      </strong>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        末尾を先頭へ滑らかにフェード合成してループ境目のカクつきを完全解消
                      </div>
                    </div>
                  </label>

                  {loopMode === 'seamless' && (
                    <div
                      style={{
                        padding: '8px 12px',
                        background: 'rgba(59, 130, 246, 0.08)',
                        borderRadius: '6px',
                        border: '1px solid rgba(59, 130, 246, 0.2)',
                        marginTop: '2px',
                        marginBottom: '4px',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: '4px',
                        }}
                      >
                        <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>
                          フェード接続時間
                        </span>
                        <span
                          style={{
                            fontSize: '0.8rem',
                            color: '#60a5fa',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                          }}
                        >
                          {crossfadeDuration.toFixed(2)} 秒（約{' '}
                          {Math.max(2, Math.round(crossfadeDuration * fps))}{' '}
                          コマ）
                        </span>
                      </div>
                      <input
                        type="range"
                        className="pcm-seekbar"
                        min="0.1"
                        max="1.0"
                        step="0.05"
                        value={crossfadeDuration}
                        onChange={(e) =>
                          setCrossfadeDuration(parseFloat(e.target.value))
                        }
                      />
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: '#64748b',
                          marginTop: '2px',
                        }}
                      >
                        末尾 {crossfadeDuration.toFixed(2)}{' '}
                        秒を先頭フレームへ溶け込ませて繋ぎ目を消します
                      </div>
                    </div>
                  )}

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background:
                        loopMode === 'pingpong'
                          ? 'rgba(59, 130, 246, 0.15)'
                          : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${loopMode === 'pingpong' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'}`,
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    <input
                      type="radio"
                      name="loopMode"
                      value="pingpong"
                      checked={loopMode === 'pingpong'}
                      onChange={() => setLoopMode('pingpong')}
                    />
                    <div>
                      <strong>🔁 往復リバースループ</strong>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        停止位置から逆再生して最初に戻す（非ループ動画を自然にループ化）
                      </div>
                    </div>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background:
                        loopMode === 'forward'
                          ? 'rgba(59, 130, 246, 0.15)'
                          : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${loopMode === 'forward' ? '#3b82f6' : 'rgba(255, 255, 255, 0.1)'}`,
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                    }}
                  >
                    <input
                      type="radio"
                      name="loopMode"
                      value="forward"
                      checked={loopMode === 'forward'}
                      onChange={() => setLoopMode('forward')}
                    />
                    <div>
                      <strong>🔄 通常の順方向ループ</strong>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                        停止位置から先頭へジャンプ（元からシームレスな動画用）
                      </div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* 3. 暗転・フェード設定 */}
          <div className="pcm-panel">
            <div className="pcm-panel-title">🌑 暗転・フェード演出</div>

            <label
              className="pcm-toggle-row"
              style={{ marginBottom: fadeEnabled ? '12px' : '0' }}
            >
              <span className="pcm-toggle-label">
                🎬 ループ末尾に暗転（フェード）を挿入
              </span>
              <input
                type="checkbox"
                checked={fadeEnabled}
                onChange={(e) => setFadeEnabled(e.target.checked)}
              />
            </label>

            {fadeEnabled && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                {/* 暗転カラー */}
                <div>
                  <label
                    className="pcm-form-label"
                    style={{ marginBottom: '6px' }}
                  >
                    暗転カラー
                  </label>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <input
                      type="color"
                      value={fadeColor}
                      onChange={(e) => setFadeColor(e.target.value)}
                      style={{
                        width: '36px',
                        height: '36px',
                        padding: '0',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        background: 'transparent',
                      }}
                    />
                    <input
                      type="text"
                      className="pcm-input-text"
                      value={fadeColor}
                      onChange={(e) => setFadeColor(e.target.value)}
                      placeholder="#000000"
                      style={{ width: '90px' }}
                    />
                    {/* プリセットカラーボタン */}
                    <div style={{ display: 'flex', gap: '4px', flex: 1 }}>
                      {[
                        { name: '黒', val: '#000000' },
                        { name: '白', val: '#ffffff' },
                        { name: '紺', val: '#0f172a' },
                        { name: '茶', val: '#2c1810' },
                      ].map((c) => (
                        <button
                          key={c.val}
                          type="button"
                          className="pcm-btn-mini"
                          onClick={() => setFadeColor(c.val)}
                          style={{
                            flex: 1,
                            padding: '4px',
                            background:
                              fadeColor === c.val
                                ? 'rgba(59, 130, 246, 0.3)'
                                : undefined,
                            borderColor:
                              fadeColor === c.val ? '#3b82f6' : undefined,
                          }}
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 暗転秒数 */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '4px',
                    }}
                  >
                    <label className="pcm-form-label" style={{ margin: 0 }}>
                      暗転時間（秒数）
                    </label>
                    <span style={{ fontSize: '0.8rem', color: '#60a5fa' }}>
                      {fadeDuration.toFixed(2)} 秒（約{' '}
                      {Math.max(1, Math.round(fadeDuration * fps))} コマ）
                    </span>
                  </div>
                  <input
                    type="range"
                    className="pcm-seekbar"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={fadeDuration}
                    onChange={(e) =>
                      setFadeDuration(parseFloat(e.target.value))
                    }
                  />
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: '#64748b',
                      marginTop: '2px',
                    }}
                  >
                    末尾 {fadeDuration.toFixed(2)}{' '}
                    秒にかけて徐々に暗転し、先頭（またはリバース）へ繋げます
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. 出力設定 */}
          <div className="pcm-panel">
            <div className="pcm-panel-title">⚙️ 出力設定</div>

            <div className="pcm-form-group">
              <label className="pcm-form-label">カードID（英小文字）</label>
              <input
                type="text"
                className="pcm-input-text"
                value={cardId}
                onChange={(e) =>
                  setCardId(
                    e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '')
                  )
                }
                placeholder="cyborgninja"
              />
              <div
                style={{
                  fontSize: '0.75rem',
                  color: '#64748b',
                  marginTop: '4px',
                }}
              >
                出力先: public/assets/cards/card_{cardId || 'id'}_premium.webp
              </div>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '8px',
              }}
            >
              <div className="pcm-form-group">
                <label className="pcm-form-label">FPS (フレームレート)</label>
                <select
                  className="pcm-select"
                  value={fps}
                  onChange={(e) => setFps(parseInt(e.target.value, 10))}
                >
                  <option value="10">10 fps (軽量)</option>
                  <option value="12">12 fps</option>
                  <option value="15">15 fps (標準推奨)</option>
                  <option value="18">18 fps</option>
                  <option value="20">20 fps (高品位)</option>
                  <option value="24">24 fps (最高滑らか)</option>
                </select>
              </div>

              <div className="pcm-form-group">
                <label className="pcm-form-label">品質: {quality}%</label>
                <input
                  type="range"
                  className="pcm-seekbar"
                  min="40"
                  max="90"
                  step="5"
                  value={quality}
                  onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                />
              </div>
            </div>

            <label className="pcm-toggle-row">
              <span className="pcm-toggle-label">
                🖼️ サムネイル同時出力 (_thumb.webp 200×300)
              </span>
              <input
                type="checkbox"
                checked={includeThumbnail}
                onChange={(e) => setIncludeThumbnail(e.target.checked)}
              />
            </label>
          </div>

          {/* 4. 書き出しボタン & 進捗 */}
          <div className="pcm-panel">
            <button
              className="pcm-btn-primary"
              onClick={handleExport}
              disabled={isEncoding || !videoUrl}
            >
              {isEncoding
                ? `エンコード中 (${progress.percent}%) ...`
                : '✨ WebP アニメーションを書き出し'}
            </button>

            {isEncoding && (
              <div className="pcm-progress-box">
                <div className="pcm-progress-header">
                  <span>進捗: {progress.percent}%</span>
                  <span>
                    {progress.current} / {progress.total} フレーム
                  </span>
                </div>
                <div className="pcm-progress-bar-bg">
                  <div
                    className="pcm-progress-bar-fill"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {statusMessage && (
              <div className={`pcm-result-box ${statusMessage.type}`}>
                {statusMessage.text}
              </div>
            )}

            <button
              className="pcm-btn-secondary"
              onClick={copyFfmpegCommand}
              disabled={!videoUrl}
            >
              📋 同設定の ffmpeg コマンドをコピー
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
