/**
 * Mini Card Battle - Premium Card Animation Maker
 *
 * MP4/WebM動画および静止画（PNG/JPG/WebP等）からカード規格（400x600, 2:3比率）の
 * ループアニメーションWebPとサムネイルをブラウザ上で視覚的に作成・エクスポートする開発ツール。
 * 複数範囲指定対応のグラデーション発光ループエフェクト（パルス・シマー）を搭載。
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
 * @param {number} w - メディア幅
 * @param {number} h - メディア高さ
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
 * @param {number} w - メディア幅
 * @param {number} h - メディア高さ
 * @returns {number} 最大スケール
 */
function computeMaxScale(w, h) {
  return computeMinScale(w, h) * 4.0;
}

/**
 * パン位置およびズーム倍率をビューポート内に収まるようクランプ（枠はみ出し防止）
 * @param {{x: number, y: number}} targetPan - 目的のパン座標
 * @param {number} targetZoom - 目的のズーム倍率
 * @param {number} w - メディア幅
 * @param {number} h - メディア高さ
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

/**
 * 元画像のグラフィックそのものをベースにして、指定範囲を自己発光（ハイライト・グロー）させる
 * @param {CanvasRenderingContext2D} ctx - 描画先コンテキスト
 * @param {number} width - 描画先幅
 * @param {number} height - 描画先高さ
 * @param {CanvasImageSource} sourceElement - 元画像/動画要素または現在フレームの Canvas
 * @param {number} progress - ループ進行度 (0.0 ~ 1.0)
 * @param {Array<Object>} regions - 発光エリア設定配列
 * @param {Object} [viewTransform] - プレビュー用ズーム・パン情報 { pan: {x, y}, zoom: number, mediaDims: {width, height} }
 */
function drawGlowEffects(
  ctx,
  width,
  height,
  sourceElement,
  progress,
  regions,
  viewTransform = null
) {
  if (!regions || regions.length === 0 || !sourceElement) return;

  regions.forEach((region) => {
    if (!region.enabled) return;

    const freq = region.frequency || 1;
    const phase = region.phase || 0;
    const currentPhase = (progress * freq + phase) % 1.0;

    let glowFactor = 1.0;
    if (region.mode === 'shimmer') {
      glowFactor = 1.0;
    } else {
      // パルス（呼吸明滅）: 0.0 ~ 1.0 の滑らかな正弦波カーブで自然に明滅
      const sineVal =
        0.5 + 0.5 * Math.sin(currentPhase * Math.PI * 2 - Math.PI / 2);
      glowFactor = sineVal;
    }

    const intensity = (region.intensity ?? 0.5) * glowFactor;
    if (intensity <= 0.005) return;

    // 1. 元画像の切り抜き準備用キャンバスを作成
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) return;

    // 元画像の描画（プレビュー時のトランスフォーム対応 or 書き出し時の直接描画）
    if (viewTransform && viewTransform.zoom) {
      const { pan, zoom, mediaDims } = viewTransform;
      const scaleX = width / VIEWPORT_WIDTH;
      const scaleY = height / VIEWPORT_HEIGHT;
      tempCtx.save();
      tempCtx.scale(scaleX, scaleY);
      tempCtx.translate(pan.x, pan.y);
      tempCtx.scale(zoom, zoom);
      tempCtx.drawImage(
        sourceElement,
        0,
        0,
        mediaDims.width || width,
        mediaDims.height || height
      );
      tempCtx.restore();
    } else {
      tempCtx.drawImage(sourceElement, 0, 0, width, height);
    }

    // 2. 輝度ブースト（明るさを自然に増幅して発光感を抽出）
    const boost = region.brightnessBoost || 1.4;
    const boostCanvas = document.createElement('canvas');
    boostCanvas.width = width;
    boostCanvas.height = height;
    const boostCtx = boostCanvas.getContext('2d');
    if (boostCtx) {
      boostCtx.filter = `brightness(${boost}) contrast(1.05)`;
      boostCtx.drawImage(tempCanvas, 0, 0);
      tempCtx.clearRect(0, 0, width, height);
      tempCtx.drawImage(boostCanvas, 0, 0);
    }

    // 3. マスクキャンバスの作成
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = width;
    maskCanvas.height = height;
    const maskCtx = maskCanvas.getContext('2d');
    if (!maskCtx) return;

    const cx = (region.x ?? 0.5) * width;
    const cy = (region.y ?? 0.5) * height;

    if (region.shape === 'rect') {
      const rw = (region.width ?? 0.4) * width;
      const rh = (region.height ?? 0.3) * height;
      const rx = cx - rw / 2;
      const ry = cy - rh / 2;
      const feather = Math.max(0.05, region.feather ?? 0.5);

      if (region.mode === 'shimmer') {
        const shimmerOffset = currentPhase * 2 - 0.5; // -0.5 ~ 1.5
        const grad = maskCtx.createLinearGradient(
          rx + rw * (shimmerOffset - 0.25),
          ry,
          rx + rw * (shimmerOffset + 0.25),
          ry + rh
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.5, 'rgba(255,255,255,1.0)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        maskCtx.fillStyle = grad;
        maskCtx.fillRect(rx, ry, rw, rh);
      } else {
        const maxR = Math.max(rw, rh) / 2;
        const grad = maskCtx.createRadialGradient(
          cx,
          cy,
          maxR * (1 - feather),
          cx,
          cy,
          maxR
        );
        grad.addColorStop(0, 'rgba(255,255,255,1.0)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        maskCtx.fillStyle = grad;
        maskCtx.fillRect(rx, ry, rw, rh);
      }
    } else {
      // 円形エリア (Radial)
      const radius = (region.radius ?? 0.3) * Math.min(width, height);
      const feather = Math.max(0.05, region.feather ?? 0.5);
      const innerRadius = Math.max(0, radius * (1 - feather));

      if (region.mode === 'shimmer') {
        const waveR = radius * currentPhase;
        const grad = maskCtx.createRadialGradient(
          cx,
          cy,
          Math.max(0, waveR - radius * 0.2),
          cx,
          cy,
          waveR
        );
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.8, 'rgba(255,255,255,1.0)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        maskCtx.fillStyle = grad;
        maskCtx.beginPath();
        maskCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        maskCtx.fill();
      } else {
        const grad = maskCtx.createRadialGradient(
          cx,
          cy,
          innerRadius,
          cx,
          cy,
          radius
        );
        grad.addColorStop(0, 'rgba(255,255,255,1.0)');
        grad.addColorStop(0.6, 'rgba(255,255,255,0.8)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');

        maskCtx.fillStyle = grad;
        maskCtx.beginPath();
        maskCtx.arc(cx, cy, radius, 0, Math.PI * 2);
        maskCtx.fill();
      }
    }

    // 4. マスクで切り抜き (destination-in)
    tempCtx.globalCompositeOperation = 'destination-in';
    tempCtx.drawImage(maskCanvas, 0, 0);

    // 5. 描画先キャンバスに元画像のハイライト層を加算合成
    ctx.save();
    ctx.globalCompositeOperation = region.blendMode || 'screen'; // 'screen' (自然な明度アップ) または 'lighter' (加算)
    ctx.globalAlpha = Math.min(1.0, intensity);
    ctx.drawImage(tempCanvas, 0, 0);
    ctx.restore();
  });
}

export default function PremiumCardMaker() {
  // メディア種別およびメタデータ
  /** @type {['video'|'image']} */
  const [sourceType, setSourceType] = useState('video'); // 'video' または 'image'
  const [mediaFile, setMediaFile] = useState(null);
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaDims, setMediaDims] = useState({
    width: 0,
    height: 0,
    duration: 0,
  });

  // 静止画モード専用設定
  const [imageDuration, setImageDuration] = useState(2.0); // 静止画のアニメーション秒数 (0.5 ~ 10.0秒)

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

  // 元画像自己発光ループエフェクト設定
  const [glowEnabled, setGlowEnabled] = useState(true);
  const [showGlowGuides, setShowGlowGuides] = useState(true);
  const [glowRegions, setGlowRegions] = useState([
    {
      id: 'glow_1',
      name: 'エリア 1 (発光)',
      enabled: true,
      shape: 'radial', // 'radial' | 'rect'
      x: 0.5,
      y: 0.45,
      radius: 0.35,
      width: 0.4,
      height: 0.4,
      feather: 0.6,
      intensity: 0.6, // 発光強度 (0.1 ~ 1.0: 少しだけ発光)
      brightnessBoost: 1.4, // 輝度ブースト倍率 (1.1 ~ 2.5)
      mode: 'pulse', // 'pulse' | 'shimmer'
      frequency: 1,
      phase: 0.0,
      blendMode: 'screen', // 'screen' | 'lighter'
    },
  ]);

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
  const imageRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const glowCanvasRef = useRef(null);
  const viewportRef = useRef(null);
  const animationFrameRef = useRef(null);
  const frameCacheRef = useRef([]); // 順再生中に蓄積する ImageBitmap キャッシュ
  const lastCaptureTimeRef = useRef(-1);
  const [isReverseMode, setIsReverseMode] = useState(false); // 逆再生描画モードフラグ
  const playbackDirRef = useRef(1); // 1: 順方向, -1: 逆方向 (pingpong 用)
  const virtualTimeRef = useRef(0); // プレビュー仮想再生時刻
  const lastUiUpdateRef = useRef(0); // UI更新スロットル用タイムスタンプ

  /**
   * メディアファイル（動画 or 静止画）読み込みハンドラ
   * @param {File} file - 選択されたファイル
   */
  const handleLoadMedia = useCallback(
    (file) => {
      if (!file) return;

      const isVideo = file.type.startsWith('video/');
      const isImage = file.type.startsWith('image/');

      if (!isVideo && !isImage) {
        setStatusMessage({
          type: 'error',
          text: '有効な動画ファイル（MP4 / WebM等）または画像ファイル（PNG / JPG / WebP等）を選択してください。',
        });
        return;
      }

      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
      }

      const url = URL.createObjectURL(file);
      setMediaFile(file);
      setMediaUrl(url);
      setSourceType(isVideo ? 'video' : 'image');
      setIsPlaying(false);
      setStatusMessage(null);

      // ファイル名からカードID候補を自動推測（例: card_cyborgninja_premium.png -> cyborgninja）
      const cleanName = file.name
        .replace(/^card_/, '')
        .replace(/_premium.*$/, '')
        .replace(/\.[^/.]+$/, '');
      if (cleanName) {
        setCardId(cleanName);
      }

      if (isImage) {
        const img = new Image();
        img.onload = () => {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          setMediaDims({ width: w, height: h, duration: imageDuration });
          setStartTime(0);
          setEndTime(imageDuration);
          setCurrentTime(0);

          const minScale = computeMinScale(w, h);
          const initialPan = {
            x: (VIEWPORT_WIDTH - w * minScale) / 2,
            y: (VIEWPORT_HEIGHT - h * minScale) / 2,
          };
          const clamped = clampPanAndZoom(initialPan, minScale, w, h);
          setZoom(clamped.zoom);
          setPan(clamped.pan);
        };
        img.src = url;
      }
    },
    [mediaUrl, imageDuration]
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

    setMediaDims({ width: w, height: h, duration: dur });
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

  /**
   * 再生・停止トグル
   */
  const togglePlay = () => {
    if (sourceType === 'video') {
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
    } else {
      setIsPlaying(!isPlaying);
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
   * プレビューループ（静止画アニメーション、動画再生、および発光エフェクトのリアルタイム合成）
   */
  useEffect(() => {
    let lastFrameTimestamp = performance.now();

    const renderLoop = (now) => {
      const dt = Math.min(0.1, (now - lastFrameTimestamp) / 1000);
      lastFrameTimestamp = now;

      // 1. 再生時刻の更新
      let currentProgress = 0;

      if (sourceType === 'video') {
        const video = videoRef.current;
        if (video && isPlaying) {
          if (playbackDirRef.current === 1) {
            virtualTimeRef.current = video.currentTime;
            setIsReverseMode(false);
            captureFrameForCache(video, video.currentTime);

            // 暗転フェード
            if (fadeEnabled && fadeDuration > 0) {
              const rem = endTime - video.currentTime;
              if (rem <= fadeDuration && rem >= 0) {
                setFadeOpacity(
                  Math.min(1, Math.max(0, 1 - rem / fadeDuration))
                );
              } else {
                setFadeOpacity(0);
              }
            } else {
              setFadeOpacity(0);
            }

            if (now - lastUiUpdateRef.current > 50) {
              lastUiUpdateRef.current = now;
              setCurrentTime(video.currentTime);
            }

            if (video.currentTime >= endTime || video.ended) {
              if (loopMode === 'pingpong') {
                playbackDirRef.current = -1;
                setIsReverseMode(true);
                video.pause();
                const safeEnd = Math.min(endTime, video.duration || endTime);
                virtualTimeRef.current = safeEnd;
                renderReverseFrame(safeEnd);
                setCurrentTime(safeEnd);
              } else {
                playbackDirRef.current = 1;
                setIsReverseMode(false);
                virtualTimeRef.current = startTime;
                video.currentTime = startTime;
                setCurrentTime(startTime);
                video.play().catch(() => {});
              }
            } else if (video.paused && !video.seeking) {
              video.play().catch(() => {});
            }
          } else {
            // 逆再生
            virtualTimeRef.current -= dt * playbackSpeed;
            renderReverseFrame(virtualTimeRef.current);

            if (fadeEnabled && fadeDuration > 0) {
              const rem = virtualTimeRef.current - startTime;
              if (rem <= fadeDuration && rem >= 0) {
                setFadeOpacity(
                  Math.min(1, Math.max(0, 1 - rem / fadeDuration))
                );
              } else {
                setFadeOpacity(0);
              }
            } else {
              setFadeOpacity(0);
            }

            if (now - lastUiUpdateRef.current > 50) {
              lastUiUpdateRef.current = now;
              setCurrentTime(virtualTimeRef.current);
            }

            if (virtualTimeRef.current <= startTime) {
              playbackDirRef.current = 1;
              setIsReverseMode(false);
              virtualTimeRef.current = startTime;
              video.currentTime = startTime;
              setCurrentTime(startTime);
              setFadeOpacity(0);
              video.play().catch(() => {});
            }
          }
        }

        const dur = Math.max(0.01, endTime - startTime);
        currentProgress = Math.max(
          0,
          Math.min(1, (currentTime - startTime) / dur)
        );
      } else {
        // 静止画モード
        if (isPlaying) {
          virtualTimeRef.current =
            (virtualTimeRef.current + dt * playbackSpeed) % imageDuration;
          if (now - lastUiUpdateRef.current > 50) {
            lastUiUpdateRef.current = now;
            setCurrentTime(virtualTimeRef.current);
          }
        }
        currentProgress =
          imageDuration > 0 ? (currentTime % imageDuration) / imageDuration : 0;
      }

      // 2. 発光エフェクト Canvas のプレビュー描画 (VIEWPORT_WIDTH x VIEWPORT_HEIGHT)
      const glowCanvas = glowCanvasRef.current;
      if (glowCanvas) {
        const ctx = glowCanvas.getContext('2d');
        ctx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);

        const sourceEl =
          sourceType === 'image'
            ? imageRef.current
            : isReverseMode
              ? previewCanvasRef.current
              : videoRef.current;

        if (sourceEl && glowEnabled && glowRegions.length > 0) {
          drawGlowEffects(
            ctx,
            glowCanvas.width,
            glowCanvas.height,
            sourceEl,
            currentProgress,
            glowRegions,
            { pan, zoom, mediaDims }
          );
        }
      }

      animationFrameRef.current = requestAnimationFrame(renderLoop);
    };

    animationFrameRef.current = requestAnimationFrame(renderLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [
    isPlaying,
    sourceType,
    imageDuration,
    loopMode,
    playbackSpeed,
    fadeEnabled,
    fadeDuration,
    startTime,
    endTime,
    currentTime,
    glowEnabled,
    glowRegions,
    isReverseMode,
    pan,
    zoom,
    mediaDims,
  ]);

  /**
   * 特定の再生時刻へシーク
   * @param {number} t - シーク先時刻（秒）
   */
  const seekTo = (t) => {
    const maxDur = sourceType === 'video' ? mediaDims.duration : imageDuration;
    const clamped = Math.max(0, Math.min(t, maxDur));

    if (sourceType === 'video') {
      const video = videoRef.current;
      if (video) {
        video.currentTime = clamped;
      }
      setIsReverseMode(false);
      clearFrameCache();
    }
    virtualTimeRef.current = clamped;
    setCurrentTime(clamped);
  };

  /**
   * フレームの1コマ送り / 戻し
   * @param {number} direction - 1: 進む, -1: 戻る
   */
  const stepFrame = (direction) => {
    const step = 1 / fps;
    seekTo(currentTime + direction * step);
  };

  /**
   * 静止画モード時のループ時間変更ハンドラ
   * @param {number} dur - 秒数
   */
  const handleImageDurationChange = (dur) => {
    setImageDuration(dur);
    setMediaDims((prev) => ({ ...prev, duration: dur }));
    setEndTime(dur);
    if (currentTime > dur) {
      setCurrentTime(0);
      virtualTimeRef.current = 0;
    }
  };

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

      const targetPan = {
        x: dragStartRef.current.panX + dx,
        y: dragStartRef.current.panY + dy,
      };

      const clamped = clampPanAndZoom(
        targetPan,
        zoom,
        mediaDims.width,
        mediaDims.height
      );
      setPan(clamped.pan);
    },
    [isDragging, zoom, mediaDims.width, mediaDims.height]
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
   * マウスホイールによるズーム操作（カーソル位置中心）
   */
  const handleWheel = (e) => {
    e.preventDefault();
    if (!viewportRef.current || !mediaDims.width || !mediaDims.height) return;

    const rect = viewportRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.08 : 0.92;
    const targetZoom = zoom * zoomFactor;

    const scaleRatio = targetZoom / zoom;
    const targetPan = {
      x: cx - (cx - pan.x) * scaleRatio,
      y: cy - (cy - pan.y) * scaleRatio,
    };

    const clamped = clampPanAndZoom(
      targetPan,
      targetZoom,
      mediaDims.width,
      mediaDims.height
    );
    setZoom(clamped.zoom);
    setPan(clamped.pan);
  };

  /**
   * 構図プリセット適用（クランプ補正付き）
   * @param {'center' | 'top_right' | 'top' | 'reset'} preset - プリセット種別
   */
  const applyPreset = (preset) => {
    if (!mediaDims.width || !mediaDims.height) return;

    const w = mediaDims.width;
    const h = mediaDims.height;
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

        const scaleRatio = outW / VIEWPORT_WIDTH;
        const renderScale = zoom * scaleRatio;
        const renderX = pan.x * scaleRatio;
        const renderY = pan.y * scaleRatio;

        ctx.drawImage(
          video,
          renderX,
          renderY,
          mediaDims.width * renderScale,
          mediaDims.height * renderScale
        );
        resolve(canvas);
      };

      video.addEventListener('seeked', onSeeked);
      video.currentTime = targetTime;
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
   * 静止画から指定フレーム（Canvas）を生成
   * @param {HTMLImageElement} img - 画像要素
   * @param {number} outW - 出力幅
   * @param {number} outH - 出力高さ
   * @returns {HTMLCanvasElement} レンダリング済み Canvas
   */
  const renderImageFrame = (img, outW, outH) => {
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');

    const scaleRatio = outW / VIEWPORT_WIDTH;
    const renderScale = zoom * scaleRatio;
    const renderX = pan.x * scaleRatio;
    const renderY = pan.y * scaleRatio;

    ctx.drawImage(
      img,
      renderX,
      renderY,
      mediaDims.width * renderScale,
      mediaDims.height * renderScale
    );
    return canvas;
  };

  /**
   * WebP アニメーションの書き出し実行
   */
  const handleExport = async () => {
    if (!mediaUrl) {
      setStatusMessage({
        type: 'error',
        text: 'メディア（動画または画像）が読み込まれていません。',
      });
      return;
    }

    const duration =
      sourceType === 'video'
        ? Math.max(0.1, endTime - startTime)
        : Math.max(0.1, imageDuration);

    const frameInterval = (1 / fps) * playbackSpeed;
    const totalFrames = Math.max(1, Math.floor(duration / frameInterval));

    setIsEncoding(true);
    setStatusMessage(null);
    setProgress({ current: 0, total: totalFrames, percent: 0 });

    try {
      const forwardFrames = [];
      const thumbFrames = [];

      if (sourceType === 'video') {
        const hiddenVideo = document.createElement('video');
        hiddenVideo.muted = true;
        hiddenVideo.playsInline = true;
        hiddenVideo.src = mediaUrl;

        await new Promise((res, rej) => {
          hiddenVideo.onloadedmetadata = () => res();
          hiddenVideo.onerror = (e) => rej(e);
        });

        for (let i = 0; i < totalFrames; i++) {
          const frameTime = startTime + i * frameInterval;
          const frameCanvas = await captureFrameAtTime(
            hiddenVideo,
            frameTime,
            OUTPUT_WIDTH,
            OUTPUT_HEIGHT
          );

          if (glowEnabled && glowRegions.length > 0) {
            const ctx = frameCanvas.getContext('2d');
            const progressRatio = i / totalFrames;
            drawGlowEffects(
              ctx,
              OUTPUT_WIDTH,
              OUTPUT_HEIGHT,
              frameCanvas,
              progressRatio,
              glowRegions
            );
          }

          forwardFrames.push({
            canvas: frameCanvas,
            durationMs: Math.round(1000 / fps),
          });

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

          const pct = Math.round(((i + 1) / totalFrames) * 45);
          setProgress({ current: i + 1, total: totalFrames, percent: pct });
        }
      } else {
        const hiddenImg = new Image();
        hiddenImg.src = mediaUrl;
        await new Promise((res, rej) => {
          if (hiddenImg.complete) res();
          hiddenImg.onload = () => res();
          hiddenImg.onerror = (e) => rej(e);
        });

        for (let i = 0; i < totalFrames; i++) {
          const baseCanvas = renderImageFrame(
            hiddenImg,
            OUTPUT_WIDTH,
            OUTPUT_HEIGHT
          );
          const ctx = baseCanvas.getContext('2d');
          const progressRatio = i / totalFrames;

          if (glowEnabled && glowRegions.length > 0) {
            drawGlowEffects(
              ctx,
              OUTPUT_WIDTH,
              OUTPUT_HEIGHT,
              baseCanvas,
              progressRatio,
              glowRegions
            );
          }

          forwardFrames.push({
            canvas: baseCanvas,
            durationMs: Math.round(1000 / fps),
          });

          if (includeThumbnail) {
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = THUMB_WIDTH;
            thumbCanvas.height = THUMB_HEIGHT;
            const thumbCtx = thumbCanvas.getContext('2d');
            thumbCtx.drawImage(baseCanvas, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
            thumbFrames.push({
              canvas: thumbCanvas,
              durationMs: Math.round(1000 / fps),
            });
          }

          const pct = Math.round(((i + 1) / totalFrames) * 45);
          setProgress({ current: i + 1, total: totalFrames, percent: pct });
        }
      }

      let finalFrames = forwardFrames;
      let finalThumbFrames = thumbFrames;

      if (sourceType === 'video') {
        if (loopMode === 'pingpong' && forwardFrames.length > 2) {
          const reverseFrames = forwardFrames.slice(1, -1).reverse();
          finalFrames = [...forwardFrames, ...reverseFrames];

          if (includeThumbnail) {
            const reverseThumbFrames = thumbFrames.slice(1, -1).reverse();
            finalThumbFrames = [...thumbFrames, ...reverseThumbFrames];
          }
        } else if (loopMode === 'seamless' && forwardFrames.length > 3) {
          const fadeFrameCount = Math.max(
            2,
            Math.min(
              Math.round(crossfadeDuration * fps),
              Math.floor(forwardFrames.length / 2)
            )
          );

          const applySeamlessCrossfade = (framesList, w, h) => {
            const firstCanvas = framesList[0].canvas;
            const count = Math.min(fadeFrameCount, framesList.length - 1);
            const startIndex = framesList.length - count;

            for (let k = 0; k < count; k++) {
              const idx = startIndex + k;
              const alpha = (k + 1) / (count + 1);
              const srcCanvas = framesList[idx].canvas;

              const blendedCanvas = document.createElement('canvas');
              blendedCanvas.width = w;
              blendedCanvas.height = h;
              const ctx = blendedCanvas.getContext('2d');

              ctx.drawImage(srcCanvas, 0, 0);
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
      }

      if (fadeEnabled && fadeDuration > 0) {
        const fadeFrameCount = Math.max(1, Math.round(fadeDuration * fps));

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

      const webpBlob = await createAnimatedWebpBlob(finalFrames, {
        width: OUTPUT_WIDTH,
        height: OUTPUT_HEIGHT,
        fps,
        loopCount: 0,
        quality: quality / 100,
        onProgress: (cur, tot) => {
          const pct = 50 + Math.round((cur / tot) * 30);
          setProgress({ current: cur, total: tot, percent: pct });
        },
      });

      const downloadFileName = `card_${cardId || 'card'}_premium.webp`;
      downloadBlob(webpBlob, downloadFileName);

      if (includeThumbnail && finalThumbFrames.length > 0) {
        const thumbBlob = await createAnimatedWebpBlob(finalThumbFrames, {
          width: THUMB_WIDTH,
          height: THUMB_HEIGHT,
          fps,
          loopCount: 0,
          quality: 0.85,
          onProgress: (cur, tot) => {
            const pct = 80 + Math.round((cur / tot) * 20);
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
   * 発光エリアの新規追加
   */
  const handleAddGlowRegion = () => {
    const newId = `glow_${Date.now()}`;
    const newRegion = {
      id: newId,
      name: `エリア ${glowRegions.length + 1}`,
      enabled: true,
      shape: 'radial',
      x: 0.5,
      y: 0.5,
      radius: 0.3,
      width: 0.4,
      height: 0.3,
      feather: 0.6,
      intensity: 0.6,
      brightnessBoost: 1.4,
      mode: 'pulse',
      frequency: 1,
      phase: 0.0,
      blendMode: 'screen',
    };
    setGlowRegions([...glowRegions, newRegion]);
  };

  /**
   * 発光エリアのプロパティ更新
   * @param {string} id - エリアID
   * @param {string} field - フィールド名
   * @param {*} value - 値
   */
  const handleUpdateGlowRegion = (id, field, value) => {
    setGlowRegions(
      glowRegions.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  /**
   * 発光エリアの削除
   * @param {string} id - エリアID
   */
  const handleDeleteGlowRegion = (id) => {
    setGlowRegions(glowRegions.filter((r) => r.id !== id));
  };

  /**
   * 発光エリアの複製
   * @param {Object} region - 対象エリア
   */
  const handleDuplicateGlowRegion = (region) => {
    const newId = `glow_${Date.now()}`;
    const duplicated = {
      ...region,
      id: newId,
      name: `${region.name} (コピー)`,
    };
    setGlowRegions([...glowRegions, duplicated]);
  };

  /**
   * 同等設定の ffmpeg コマンド文字列を生成してクリップボードにコピー
   */
  const copyFfmpegCommand = () => {
    if (!mediaDims.width || !mediaDims.height) return;

    // ビューポート基準のパン・ズームから、元動画ピクセル座標系での crop パラメータを算出
    const scaleRatio = mediaDims.width / (mediaDims.width * zoom);
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
      {/* 共通ツールナビゲーションヘッダー */}
      <ToolNavigation
        currentToolName="プレミアムカードアニメーション作成ツール"
        category="vfx"
      />

      {/* メインレイアウト */}
      <div className="pcm-main">
        {/* 左側: プレビューセクション */}
        <section className="pcm-preview-section">
          <div className="pcm-viewport-wrapper">
            {/* プレビュービューポート (320x480, 2:3 比率) */}
            <div
              ref={viewportRef}
              className="pcm-viewport"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
              {/* メディア表示レイヤー */}
              {mediaUrl && sourceType === 'video' ? (
                <video
                  ref={videoRef}
                  src={mediaUrl}
                  className="pcm-video-layer"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    width: mediaDims.width ? `${mediaDims.width}px` : 'auto',
                    height: mediaDims.height ? `${mediaDims.height}px` : 'auto',
                  }}
                  onLoadedMetadata={handleVideoLoadedMetadata}
                  muted
                  playsInline
                />
              ) : mediaUrl && sourceType === 'image' ? (
                <img
                  ref={imageRef}
                  src={mediaUrl}
                  alt="preview"
                  className="pcm-video-layer"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    width: mediaDims.width ? `${mediaDims.width}px` : 'auto',
                    height: mediaDims.height ? `${mediaDims.height}px` : 'auto',
                    pointerEvents: 'none',
                    userSelect: 'none',
                  }}
                />
              ) : (
                <div className="pcm-placeholder">
                  <div className="pcm-placeholder-icon">🎴</div>
                  <div className="pcm-placeholder-text">
                    動画または画像を読み込んでください
                  </div>
                </div>
              )}

              {/* 逆再生用シルキーフレーム描画 Canvas */}
              {sourceType === 'video' && (
                <canvas
                  ref={previewCanvasRef}
                  className="pcm-video-layer"
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                    width: mediaDims.width ? `${mediaDims.width}px` : 'auto',
                    height: mediaDims.height ? `${mediaDims.height}px` : 'auto',
                    display: isReverseMode ? 'block' : 'none',
                    pointerEvents: 'none',
                  }}
                />
              )}

              {/* 発光エフェクト描画 Canvas */}
              <canvas
                ref={glowCanvasRef}
                width={VIEWPORT_WIDTH}
                height={VIEWPORT_HEIGHT}
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  zIndex: 8,
                }}
              />

              {/* 発光エリアの視覚的ガイド枠 */}
              {showGlowGuides && glowEnabled && glowRegions.length > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                >
                  {glowRegions.map((region, idx) => {
                    if (!region.enabled) return null;
                    const guideColor = [
                      '#38bdf8',
                      '#f59e0b',
                      '#10b981',
                      '#ec4899',
                      '#a855f7',
                    ][idx % 5];
                    const cx = (region.x ?? 0.5) * VIEWPORT_WIDTH;
                    const cy = (region.y ?? 0.5) * VIEWPORT_HEIGHT;
                    if (region.shape === 'rect') {
                      const rw = (region.width ?? 0.4) * VIEWPORT_WIDTH;
                      const rh = (region.height ?? 0.3) * VIEWPORT_HEIGHT;
                      return (
                        <div
                          key={region.id}
                          style={{
                            position: 'absolute',
                            left: `${cx - rw / 2}px`,
                            top: `${cy - rh / 2}px`,
                            width: `${rw}px`,
                            height: `${rh}px`,
                            border: `2px dashed ${guideColor}`,
                            borderRadius: '4px',
                            boxShadow: `0 0 8px ${guideColor}80`,
                            pointerEvents: 'none',
                          }}
                        >
                          <span
                            style={{
                              position: 'absolute',
                              top: '-18px',
                              left: '0',
                              fontSize: '10px',
                              fontWeight: 'bold',
                              color: '#fff',
                              background: 'rgba(0,0,0,0.7)',
                              padding: '1px 4px',
                              borderRadius: '3px',
                            }}
                          >
                            {region.name}
                          </span>
                        </div>
                      );
                    }
                    const r =
                      (region.radius ?? 0.3) *
                      Math.min(VIEWPORT_WIDTH, VIEWPORT_HEIGHT);
                    return (
                      <div
                        key={region.id}
                        style={{
                          position: 'absolute',
                          left: `${cx - r}px`,
                          top: `${cy - r}px`,
                          width: `${r * 2}px`,
                          height: `${r * 2}px`,
                          border: `2px dashed ${guideColor}`,
                          borderRadius: '50%',
                          boxShadow: `0 0 8px ${guideColor}80`,
                          pointerEvents: 'none',
                        }}
                      >
                        <span
                          style={{
                            position: 'absolute',
                            top: '-18px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            fontSize: '10px',
                            fontWeight: 'bold',
                            color: '#fff',
                            background: 'rgba(0,0,0,0.7)',
                            padding: '1px 4px',
                            borderRadius: '3px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {region.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 暗転オーバーレイ（プレビュー用） */}
              {fadeEnabled && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundColor: fadeColor,
                    opacity: fadeOpacity,
                    pointerEvents: 'none',
                    zIndex: 11,
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
                📐 カード枠
              </button>
              <button
                className={`pcm-btn-mini ${showGlowGuides ? 'active' : ''}`}
                onClick={() => setShowGlowGuides(!showGlowGuides)}
                title="発光エリアの境界ガイド枠を表示/非表示"
              >
                ✨ 発光ガイド
              </button>
            </div>
          </div>
        </section>

        {/* 右側: コントロールパネル */}
        <aside className="pcm-control-section">
          {/* 1. ファイル読み込み */}
          <div className="pcm-panel">
            <div className="pcm-panel-title">
              📁 メディア読み込み（動画 / 画像）
            </div>
            <div
              className="pcm-dropzone"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept =
                  'video/mp4,video/webm,video/*,image/png,image/jpeg,image/webp,image/*';
                input.onchange = (e) => handleLoadMedia(e.target.files[0]);
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
                handleLoadMedia(e.dataTransfer.files[0]);
              }}
            >
              <div className="pcm-dropzone-icon">
                {sourceType === 'video' ? '📹' : '🖼️'}
              </div>
              <div className="pcm-dropzone-text">
                {mediaFile
                  ? mediaFile.name
                  : '動画 (MP4/WebM) または 画像 (PNG/JPG/WebP) をドロップ'}
              </div>
              <div className="pcm-dropzone-subtext">
                またはクリックしてファイルを選択
              </div>
            </div>
            {mediaFile && (
              <div
                style={{
                  marginTop: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontSize: '0.75rem',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontWeight: 'bold',
                    background:
                      sourceType === 'video'
                        ? 'rgba(59, 130, 246, 0.2)'
                        : 'rgba(16, 185, 129, 0.2)',
                    color: sourceType === 'video' ? '#60a5fa' : '#34d399',
                    border: `1px solid ${sourceType === 'video' ? 'rgba(59, 130, 246, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
                  }}
                >
                  {sourceType === 'video'
                    ? '📹 動画モード'
                    : '🖼️ 静止画アニメーションモード'}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {mediaDims.width} × {mediaDims.height} px
                </span>
              </div>
            )}
          </div>

          {/* 2. タイムライン & 再生設定 */}
          <div className="pcm-panel">
            <div className="pcm-panel-title">
              {sourceType === 'video'
                ? '⏱ タイムライン & 再生設定'
                : '⏱ アニメーション時間設定'}
            </div>

            {sourceType === 'video' ? (
              /* --- 動画モード時のタイムライン --- */
              <div className="pcm-timeline-box">
                <div className="pcm-timeline-playback">
                  <div className="pcm-time-display">
                    {currentTime.toFixed(2)}s / {mediaDims.duration.toFixed(2)}s
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
                  max={mediaDims.duration || 1}
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
                        max={mediaDims.duration || 1}
                        step="0.01"
                        value={Number(endTime.toFixed(2))}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) {
                            const maxDur = mediaDims.duration || 999;
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
                      max={mediaDims.duration || 1}
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
                    onChange={(e) =>
                      setPlaybackSpeed(parseFloat(e.target.value))
                    }
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
                          ✨ シームレス順ループ（クロスフェード）
                        </strong>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                          末尾を先頭へ滑らかにフェード合成して境目のカクつきを解消
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
                          <span
                            style={{ fontSize: '0.8rem', color: '#cbd5e1' }}
                          >
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
                          停止位置から逆再生して最初に戻す
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
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              /* --- 静止画モード時の設定 --- */
              <div className="pcm-timeline-box">
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '8px',
                  }}
                >
                  <label className="pcm-form-label" style={{ margin: 0 }}>
                    ⏱ 1ループの長さ（秒）
                  </label>
                  <span
                    style={{
                      fontSize: '0.9rem',
                      color: '#60a5fa',
                      fontWeight: 'bold',
                      fontFamily: 'monospace',
                    }}
                  >
                    {imageDuration.toFixed(2)} 秒 (
                    {Math.round(imageDuration * fps)} コマ)
                  </span>
                </div>
                <input
                  type="range"
                  className="pcm-seekbar"
                  min="0.5"
                  max="8.0"
                  step="0.1"
                  value={imageDuration}
                  onChange={(e) =>
                    handleImageDurationChange(parseFloat(e.target.value))
                  }
                />
                <div
                  style={{
                    display: 'flex',
                    gap: '4px',
                    marginTop: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  {[1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0].map((dur) => (
                    <button
                      key={dur}
                      className={`pcm-btn-mini ${imageDuration === dur ? 'active' : ''}`}
                      onClick={() => handleImageDurationChange(dur)}
                      style={{
                        flex: '1 0 auto',
                        minWidth: '40px',
                        padding: '4px 6px',
                      }}
                    >
                      {dur.toFixed(1)}s
                    </button>
                  ))}
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '14px',
                    paddingTop: '10px',
                    borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  }}
                >
                  <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                    プレビュー再生
                  </span>
                  <button
                    className={`pcm-btn-icon primary`}
                    onClick={togglePlay}
                    style={{ width: '80px', height: '32px' }}
                  >
                    {isPlaying ? '⏸ 停止' : '▶ 再生'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 3. ✨ グラデーション発光ループエフェクト設定 */}
          <div className="pcm-panel">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '8px',
              }}
            >
              <div className="pcm-panel-title" style={{ margin: 0 }}>
                ✨ グラデーション発光ループ
              </div>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  color: '#60a5fa',
                  fontWeight: 'bold',
                }}
              >
                <input
                  type="checkbox"
                  checked={glowEnabled}
                  onChange={(e) => setGlowEnabled(e.target.checked)}
                />
                有効
              </label>
            </div>

            {glowEnabled && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    発光エリア一覧 ({glowRegions.length}件)
                  </span>
                  <button
                    className="pcm-btn-mini primary"
                    onClick={handleAddGlowRegion}
                    style={{ padding: '3px 8px' }}
                  >
                    ＋ エリアを追加
                  </button>
                </div>

                {/* エリアリスト */}
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  {glowRegions.map((region) => (
                    <div
                      key={region.id}
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: `1px solid ${region.enabled ? 'rgba(59, 130, 246, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
                        borderRadius: '8px',
                        padding: '10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                      }}
                    >
                      {/* エリアヘッダー */}
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={region.enabled}
                            onChange={(e) =>
                              handleUpdateGlowRegion(
                                region.id,
                                'enabled',
                                e.target.checked
                              )
                            }
                          />
                          <input
                            type="text"
                            value={region.name}
                            onChange={(e) =>
                              handleUpdateGlowRegion(
                                region.id,
                                'name',
                                e.target.value
                              )
                            }
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#fff',
                              fontWeight: 'bold',
                              fontSize: '0.85rem',
                              width: '120px',
                            }}
                          />
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <button
                            className="pcm-btn-mini"
                            onClick={() => handleDuplicateGlowRegion(region)}
                            title="複製"
                          >
                            📋
                          </button>
                          {glowRegions.length > 1 && (
                            <button
                              className="pcm-btn-mini"
                              onClick={() => handleDeleteGlowRegion(region.id)}
                              style={{ color: '#ef4444' }}
                              title="削除"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>

                      {region.enabled && (
                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px',
                            fontSize: '0.75rem',
                          }}
                        >
                          {/* 形状 & 発光タイプ切り替え */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '6px',
                            }}
                          >
                            <div>
                              <span style={{ color: '#94a3b8' }}>形状:</span>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '2px',
                                  marginTop: '2px',
                                }}
                              >
                                <button
                                  className={`pcm-btn-mini ${region.shape === 'radial' ? 'active' : ''}`}
                                  onClick={() =>
                                    handleUpdateGlowRegion(
                                      region.id,
                                      'shape',
                                      'radial'
                                    )
                                  }
                                  style={{ flex: 1 }}
                                >
                                  ● 円形
                                </button>
                                <button
                                  className={`pcm-btn-mini ${region.shape === 'rect' ? 'active' : ''}`}
                                  onClick={() =>
                                    handleUpdateGlowRegion(
                                      region.id,
                                      'shape',
                                      'rect'
                                    )
                                  }
                                  style={{ flex: 1 }}
                                >
                                  ■ 四角形
                                </button>
                              </div>
                            </div>

                            <div>
                              <span style={{ color: '#94a3b8' }}>タイプ:</span>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '2px',
                                  marginTop: '2px',
                                }}
                              >
                                <button
                                  className={`pcm-btn-mini ${region.mode === 'pulse' ? 'active' : ''}`}
                                  onClick={() =>
                                    handleUpdateGlowRegion(
                                      region.id,
                                      'mode',
                                      'pulse'
                                    )
                                  }
                                  style={{ flex: 1 }}
                                  title="呼吸するように明滅"
                                >
                                  💓 呼吸
                                </button>
                                <button
                                  className={`pcm-btn-mini ${region.mode === 'shimmer' ? 'active' : ''}`}
                                  onClick={() =>
                                    handleUpdateGlowRegion(
                                      region.id,
                                      'mode',
                                      'shimmer'
                                    )
                                  }
                                  style={{ flex: 1 }}
                                  title="光が流れるように走査"
                                >
                                  ✨ 走査
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* 発光強度 & 輝度ブースト */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '6px',
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <span style={{ color: '#94a3b8' }}>
                                  ✨ 発光強度:
                                </span>
                                <span
                                  style={{
                                    color: '#60a5fa',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  {Math.round(region.intensity * 100)}%
                                </span>
                              </div>
                              <input
                                type="range"
                                min="0.05"
                                max="1.5"
                                step="0.05"
                                value={region.intensity}
                                onChange={(e) =>
                                  handleUpdateGlowRegion(
                                    region.id,
                                    'intensity',
                                    parseFloat(e.target.value)
                                  )
                                }
                                style={{ width: '100%' }}
                              />
                            </div>
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <span style={{ color: '#94a3b8' }}>
                                  💡 輝度倍率:
                                </span>
                                <span
                                  style={{
                                    color: '#f59e0b',
                                    fontWeight: 'bold',
                                  }}
                                >
                                  {(region.brightnessBoost || 1.4).toFixed(1)}x
                                </span>
                              </div>
                              <input
                                type="range"
                                min="1.1"
                                max="2.5"
                                step="0.1"
                                value={region.brightnessBoost || 1.4}
                                onChange={(e) =>
                                  handleUpdateGlowRegion(
                                    region.id,
                                    'brightnessBoost',
                                    parseFloat(e.target.value)
                                  )
                                }
                                style={{ width: '100%' }}
                              />
                            </div>
                          </div>

                          {/* 位置 (X, Y) */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '6px',
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <span style={{ color: '#94a3b8' }}>
                                  位置 X:
                                </span>
                                <span>{Math.round(region.x * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={region.x}
                                onChange={(e) =>
                                  handleUpdateGlowRegion(
                                    region.id,
                                    'x',
                                    parseFloat(e.target.value)
                                  )
                                }
                                style={{ width: '100%' }}
                              />
                            </div>
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <span style={{ color: '#94a3b8' }}>
                                  位置 Y:
                                </span>
                                <span>{Math.round(region.y * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.01"
                                value={region.y}
                                onChange={(e) =>
                                  handleUpdateGlowRegion(
                                    region.id,
                                    'y',
                                    parseFloat(e.target.value)
                                  )
                                }
                                style={{ width: '100%' }}
                              />
                            </div>
                          </div>

                          {/* サイズ (半径 or 幅・高さ) */}
                          {region.shape === 'radial' ? (
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <span style={{ color: '#94a3b8' }}>
                                  半径 (広さ):
                                </span>
                                <span>{Math.round(region.radius * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min="0.05"
                                max="0.8"
                                step="0.01"
                                value={region.radius}
                                onChange={(e) =>
                                  handleUpdateGlowRegion(
                                    region.id,
                                    'radius',
                                    parseFloat(e.target.value)
                                  )
                                }
                                style={{ width: '100%' }}
                              />
                            </div>
                          ) : (
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '6px',
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                  }}
                                >
                                  <span style={{ color: '#94a3b8' }}>
                                    幅 (W):
                                  </span>
                                  <span>{Math.round(region.width * 100)}%</span>
                                </div>
                                <input
                                  type="range"
                                  min="0.05"
                                  max="1.0"
                                  step="0.01"
                                  value={region.width}
                                  onChange={(e) =>
                                    handleUpdateGlowRegion(
                                      region.id,
                                      'width',
                                      parseFloat(e.target.value)
                                    )
                                  }
                                  style={{ width: '100%' }}
                                />
                              </div>
                              <div>
                                <div
                                  style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                  }}
                                >
                                  <span style={{ color: '#94a3b8' }}>
                                    高さ (H):
                                  </span>
                                  <span>
                                    {Math.round(region.height * 100)}%
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min="0.05"
                                  max="1.0"
                                  step="0.01"
                                  value={region.height}
                                  onChange={(e) =>
                                    handleUpdateGlowRegion(
                                      region.id,
                                      'height',
                                      parseFloat(e.target.value)
                                    )
                                  }
                                  style={{ width: '100%' }}
                                />
                              </div>
                            </div>
                          )}

                          {/* ぼかし (フェザー) & 合成モード */}
                          <div
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '1fr 1fr',
                              gap: '6px',
                            }}
                          >
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <span style={{ color: '#94a3b8' }}>
                                  ぼかし (減衰):
                                </span>
                                <span>{Math.round(region.feather * 100)}%</span>
                              </div>
                              <input
                                type="range"
                                min="0.05"
                                max="0.95"
                                step="0.05"
                                value={region.feather}
                                onChange={(e) =>
                                  handleUpdateGlowRegion(
                                    region.id,
                                    'feather',
                                    parseFloat(e.target.value)
                                  )
                                }
                                style={{ width: '100%' }}
                              />
                            </div>
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                }}
                              >
                                <span style={{ color: '#94a3b8' }}>
                                  発光モード:
                                </span>
                              </div>
                              <div
                                style={{
                                  display: 'flex',
                                  gap: '2px',
                                  marginTop: '2px',
                                }}
                              >
                                <button
                                  className={`pcm-btn-mini ${region.blendMode !== 'lighter' ? 'active' : ''}`}
                                  onClick={() =>
                                    handleUpdateGlowRegion(
                                      region.id,
                                      'blendMode',
                                      'screen'
                                    )
                                  }
                                  style={{ flex: 1, padding: '2px 4px' }}
                                  title="自然な明度アップ"
                                >
                                  自然
                                </button>
                                <button
                                  className={`pcm-btn-mini ${region.blendMode === 'lighter' ? 'active' : ''}`}
                                  onClick={() =>
                                    handleUpdateGlowRegion(
                                      region.id,
                                      'blendMode',
                                      'lighter'
                                    )
                                  }
                                  style={{ flex: 1, padding: '2px 4px' }}
                                  title="加算（強めの発光）"
                                >
                                  強光
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 4. トリミング・構図調整 */}
          <div className="pcm-panel">
            <div className="pcm-panel-title">✂ 構図 & ズーム調整</div>
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
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
                    🔍 ズーム倍率
                  </label>
                  <span
                    style={{
                      fontSize: '0.85rem',
                      color: '#60a5fa',
                      fontWeight: 'bold',
                    }}
                  >
                    {zoom.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range"
                  className="pcm-seekbar"
                  min={computeMinScale(mediaDims.width, mediaDims.height)}
                  max={computeMaxScale(mediaDims.width, mediaDims.height)}
                  step="0.01"
                  value={zoom}
                  onChange={(e) => {
                    const z = parseFloat(e.target.value);
                    const clamped = clampPanAndZoom(
                      pan,
                      z,
                      mediaDims.width,
                      mediaDims.height
                    );
                    setZoom(clamped.zoom);
                    setPan(clamped.pan);
                  }}
                />
              </div>

              <div
                style={{
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  background: 'rgba(255,255,255,0.03)',
                  padding: '6px 8px',
                  borderRadius: '4px',
                }}
              >
                💡
                プレビュー画面上をドラッグして位置移動、ホイールでズームが可能です。
              </div>
            </div>
          </div>

          {/* 5. 暗転・フェード演出 */}
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
                  </div>
                </div>

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
                      暗転時間
                    </label>
                    <span
                      style={{
                        fontSize: '0.85rem',
                        color: '#60a5fa',
                        fontWeight: 'bold',
                      }}
                    >
                      {fadeDuration.toFixed(2)} 秒
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
                </div>
              </div>
            )}
          </div>

          {/* 6. 出力設定 & エクスポート */}
          <div className="pcm-panel">
            <div className="pcm-panel-title">⚙ 出力設定 & WebP書き出し</div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <div>
                <label
                  className="pcm-form-label"
                  style={{ marginBottom: '4px' }}
                >
                  カードID (ファイル名)
                </label>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                    card_
                  </span>
                  <input
                    type="text"
                    className="pcm-input-text"
                    value={cardId}
                    onChange={(e) => setCardId(e.target.value)}
                    placeholder="card_id"
                    style={{ flex: 1 }}
                  />
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>
                    _premium.webp
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                }}
              >
                <div>
                  <label
                    className="pcm-form-label"
                    style={{ marginBottom: '4px' }}
                  >
                    フレームレート (FPS)
                  </label>
                  <select
                    className="pcm-input-text"
                    value={fps}
                    onChange={(e) => setFps(parseInt(e.target.value, 10))}
                  >
                    <option value={10}>10 fps (軽量)</option>
                    <option value={15}>15 fps (標準)</option>
                    <option value={20}>20 fps (高品位)</option>
                    <option value={24}>24 fps (フィルム)</option>
                    <option value={30}>30 fps (最高品質)</option>
                  </select>
                </div>

                <div>
                  <label
                    className="pcm-form-label"
                    style={{ marginBottom: '4px' }}
                  >
                    品質 ({quality}%)
                  </label>
                  <input
                    type="range"
                    className="pcm-seekbar"
                    min="30"
                    max="95"
                    step="5"
                    value={quality}
                    onChange={(e) => setQuality(parseInt(e.target.value, 10))}
                  />
                </div>
              </div>

              <label className="pcm-toggle-row">
                <span className="pcm-toggle-label">
                  🖼️ サムネイル (_thumb.webp) も同時生成
                </span>
                <input
                  type="checkbox"
                  checked={includeThumbnail}
                  onChange={(e) => setIncludeThumbnail(e.target.checked)}
                />
              </label>

              {/* 進捗バー & ステータス */}
              {isEncoding && (
                <div style={{ marginTop: '4px' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: '#60a5fa',
                      marginBottom: '4px',
                    }}
                  >
                    <span>エンコード中...</span>
                    <span>{progress.percent}%</span>
                  </div>
                  <div
                    style={{
                      height: '6px',
                      background: 'rgba(255,255,255,0.1)',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${progress.percent}%`,
                        background: '#3b82f6',
                        transition: 'width 0.1s ease',
                      }}
                    />
                  </div>
                </div>
              )}

              {statusMessage && (
                <div
                  className={`pcm-status-message ${statusMessage.type}`}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    background:
                      statusMessage.type === 'success'
                        ? 'rgba(16, 185, 129, 0.2)'
                        : 'rgba(239, 68, 68, 0.2)',
                    color:
                      statusMessage.type === 'success' ? '#10b981' : '#ef4444',
                    border: `1px solid ${statusMessage.type === 'success' ? '#10b981' : '#ef4444'}`,
                  }}
                >
                  {statusMessage.text}
                </div>
              )}

              <button
                className="pcm-btn-primary"
                onClick={handleExport}
                disabled={isEncoding || !mediaUrl}
                style={{
                  padding: '12px',
                  fontSize: '0.95rem',
                  fontWeight: 'bold',
                  marginTop: '4px',
                }}
              >
                {isEncoding
                  ? `⚙ 書き出し中 (${progress.percent}%)...`
                  : '🚀 アニメーションWebPを書き出し'}
              </button>

              <button
                className="pcm-btn-secondary"
                onClick={copyFfmpegCommand}
                disabled={!mediaUrl}
              >
                📋 同設定の ffmpeg コマンドをコピー
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
