import { useState, useEffect, useRef, useCallback } from 'react';
import '../common/toolNavStandalone.js';
import './VfxSpritesheetTool.css';

/**
 * 自然順（ナチュラルソート）比較関数
 *
 * @param {string} a 比較文字列A
 * @param {string} b 比較文字列B
 * @return {number} ソート順 (-1, 0, 1)
 */
function naturalCompare(a, b) {
  const re = /(\d+)|(\D+)/g;
  const ax = a.match(re) || [];
  const bx = b.match(re) || [];
  const len = Math.max(ax.length, bx.length);
  for (let i = 0; i < len; i++) {
    const av = ax[i] ?? '';
    const bv = bx[i] ?? '';
    if (av === bv) continue;
    const an = /^\d+$/.test(av);
    const bn = /^\d+$/.test(bv);
    if (an && bn) {
      const diff = parseInt(av, 10) - parseInt(bv, 10);
      if (diff !== 0) return diff;
    } else {
      return av < bv ? -1 : 1;
    }
  }
  return 0;
}

/**
 * 単一画像ファイルの非同期読み込み
 *
 * @param {File} file 対象画像ファイル
 * @return {Promise<HTMLImageElement>} ロードされたImage要素
 */
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve(img);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました: ' + file.name));
    };
    img.src = url;
  });
}

/**
 * 連番画像ファイルの読み込みとCanvas変換
 *
 * @param {File[]} files 画像ファイル配列
 * @return {Promise<HTMLCanvasElement[]>} フレームCanvas配列
 */
async function loadImageSequence(files) {
  const sorted = files.slice().sort((a, b) => naturalCompare(a.name, b.name));
  const frames = [];
  for (const file of sorted) {
    const img = await loadImageFromFile(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext('2d').drawImage(img, 0, 0);
    frames.push(canvas);
  }
  return frames;
}

/**
 * GIFバイナリ読み込みヘルパークラス
 */
class ByteReader {
  /**
   * @param {ArrayBuffer} buf バッファデータ
   */
  constructor(buf) {
    this.data = new Uint8Array(buf);
    this.pos = 0;
  }
  u8() {
    return this.data[this.pos++];
  }
  u16() {
    const v = this.data[this.pos] | (this.data[this.pos + 1] << 8);
    this.pos += 2;
    return v;
  }
  bytes(n) {
    const v = this.data.subarray(this.pos, this.pos + n);
    this.pos += n;
    return v;
  }
  readSubBlocks() {
    const blocks = [];
    let total = 0;
    let size;
    while ((size = this.u8()) !== 0) {
      const b = this.bytes(size);
      blocks.push(b);
      total += b.length;
    }
    const out = new Uint8Array(total);
    let off = 0;
    for (const b of blocks) {
      out.set(b, off);
      off += b.length;
    }
    return out;
  }
}

/**
 * GIFカラーテーブル読み込み
 */
function readColorTable(r, size) {
  const table = [];
  for (let i = 0; i < size; i++) table.push([r.u8(), r.u8(), r.u8()]);
  return table;
}

/**
 * GIF LZWデコード処理
 */
function lzwDecode(minCodeSize, data) {
  const clearCode = 1 << minCodeSize;
  const eoiCode = clearCode + 1;
  let codeSize;
  let dict;
  const resetDict = () => {
    dict = [];
    for (let i = 0; i < clearCode; i++) dict[i] = [i];
    dict[clearCode] = null;
    dict[eoiCode] = null;
    codeSize = minCodeSize + 1;
  };
  resetDict();

  const output = [];
  let bitPos = 0;
  const totalBits = data.length * 8;
  function readCode() {
    let code = 0;
    for (let i = 0; i < codeSize; i++) {
      if (bitPos >= totalBits) return eoiCode;
      const byteIndex = bitPos >> 3;
      const bitIndex = bitPos & 7;
      code |= ((data[byteIndex] >> bitIndex) & 1) << i;
      bitPos++;
    }
    return code;
  }

  let prev = null;
  while (true) {
    const code = readCode();
    if (code === clearCode) {
      resetDict();
      prev = null;
      continue;
    }
    if (code === eoiCode) break;
    let entry;
    if (code < dict.length && dict[code]) {
      entry = dict[code];
    } else if (code === dict.length && prev) {
      entry = prev.concat([prev[0]]);
    } else {
      break;
    }
    for (let k = 0; k < entry.length; k++) output.push(entry[k]);
    if (prev) {
      dict.push(prev.concat([entry[0]]));
      if (dict.length === 1 << codeSize && codeSize < 12) codeSize++;
    }
    prev = entry;
  }
  return output;
}

/**
 * GIFインターレース行順計算
 */
function computeInterlaceRowOrder(height) {
  const order = new Array(height);
  let i = 0;
  for (let y = 0; y < height; y += 8) order[i++] = y;
  for (let y = 4; y < height; y += 8) order[i++] = y;
  for (let y = 2; y < height; y += 4) order[i++] = y;
  for (let y = 1; y < height; y += 2) order[i++] = y;
  return order;
}

/**
 * GIFアニメーションデータの完全解読デコード処理
 *
 * @param {ArrayBuffer} arrayBuffer GIFバイナリデータ
 * @return {Promise<HTMLCanvasElement[]>} 抽出フレーム一覧
 */
async function decodeGif(arrayBuffer) {
  const r = new ByteReader(arrayBuffer);
  const header = String.fromCharCode(...r.bytes(6));
  if (header.slice(0, 3) !== 'GIF') {
    throw new Error('GIF形式として読み取れませんでした');
  }
  const screenWidth = r.u16();
  const screenHeight = r.u16();
  const packed = r.u8();
  const gctFlag = (packed & 0x80) !== 0;
  const gctSize = 2 << (packed & 0x07);
  r.u8();
  r.u8();
  const globalColorTable = gctFlag ? readColorTable(r, gctSize) : null;

  const mainCanvas = document.createElement('canvas');
  mainCanvas.width = screenWidth;
  mainCanvas.height = screenHeight;
  const mainCtx = mainCanvas.getContext('2d');

  const frames = [];
  let transparentIndex = -1;
  let disposalMethod = 0;
  let previousSnapshot = null;

  while (r.pos < r.data.length) {
    const blockType = r.u8();
    if (blockType === 0x3b) break;

    if (blockType === 0x21) {
      const label = r.u8();
      const data = r.readSubBlocks();
      if (label === 0xf9 && data.length >= 4) {
        const p = data[0];
        disposalMethod = (p >> 2) & 0x07;
        transparentIndex = p & 0x01 ? data[3] : -1;
      }
      continue;
    }

    if (blockType === 0x2c) {
      const left = r.u16();
      const top = r.u16();
      const width = r.u16();
      const height = r.u16();
      const imgPacked = r.u8();
      const lctFlag = (imgPacked & 0x80) !== 0;
      const interlaced = (imgPacked & 0x40) !== 0;
      const lctSize = 2 << (imgPacked & 0x07);
      const colorTable = lctFlag
        ? readColorTable(r, lctSize)
        : globalColorTable;
      const minCodeSize = r.u8();
      const imgData = r.readSubBlocks();
      const indices = lzwDecode(minCodeSize, imgData);

      if (disposalMethod === 3) {
        previousSnapshot = mainCtx.getImageData(
          0,
          0,
          screenWidth,
          screenHeight
        );
      }

      if (width > 0 && height > 0 && colorTable) {
        const region = mainCtx.getImageData(left, top, width, height);
        const rowOrder = interlaced ? computeInterlaceRowOrder(height) : null;
        let idx = 0;
        for (let y = 0; y < height; y++) {
          const actualY = interlaced ? rowOrder[y] : y;
          for (let x = 0; x < width; x++) {
            const colorIndex = indices[idx++];
            if (colorIndex === undefined || colorIndex === transparentIndex)
              continue;
            const c = colorTable[colorIndex];
            if (!c) continue;
            const p = (actualY * width + x) * 4;
            region.data[p] = c[0];
            region.data[p + 1] = c[1];
            region.data[p + 2] = c[2];
            region.data[p + 3] = 255;
          }
        }
        mainCtx.putImageData(region, left, top);
      }

      const outCanvas = document.createElement('canvas');
      outCanvas.width = screenWidth;
      outCanvas.height = screenHeight;
      outCanvas.getContext('2d').drawImage(mainCanvas, 0, 0);
      frames.push(outCanvas);

      if (disposalMethod === 2) {
        mainCtx.clearRect(left, top, width, height);
      } else if (disposalMethod === 3 && previousSnapshot) {
        mainCtx.putImageData(previousSnapshot, 0, 0);
      }
      transparentIndex = -1;
      disposalMethod = 0;
      continue;
    }

    break;
  }
  if (frames.length === 0) {
    throw new Error('GIFからフレームを抽出できませんでした');
  }
  return frames;
}

/**
 * 動画の特定の再生時刻へシーク待機
 */
function seekTo(video, t) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    const onSeeked = () => finish();
    video.addEventListener('seeked', onSeeked);
    video.currentTime = t;
    setTimeout(finish, 2000);
  });
}

/**
 * 動画ファイルからのコマ（フレーム）抽出処理
 *
 * @param {File} file 動画ファイル (MP4, WebM等)
 * @param {number} fps 抽出フレームレート
 * @return {Promise<HTMLCanvasElement[]>} 抽出フレーム一覧
 */
async function extractVideoFrames(file, fps) {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () =>
        reject(new Error('動画の読み込みに失敗しました: ' + file.name));
    });
    const duration = video.duration;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!duration || !width || !height) {
      throw new Error('動画の情報を取得できませんでした');
    }

    const MAX_FRAMES = 300;
    const frameCount = Math.min(
      MAX_FRAMES,
      Math.max(1, Math.round(duration * fps))
    );
    const step = duration / frameCount;
    const frames = [];
    for (let i = 0; i < frameCount; i++) {
      const t = Math.min(i * step, Math.max(0, duration - 0.001));
      await seekTo(video, t);
      const frameCanvas = document.createElement('canvas');
      frameCanvas.width = width;
      frameCanvas.height = height;
      frameCanvas.getContext('2d').drawImage(video, 0, 0, width, height);
      frames.push(frameCanvas);
    }
    return frames;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * フレーム間引き（制限数以内への均等削減）
 */
function thinFrames(frames, maxCount) {
  if (!maxCount || maxCount >= frames.length) return frames.slice();
  if (maxCount <= 1) return [frames[0]];
  const result = [];
  for (let i = 0; i < maxCount; i++) {
    const idx = Math.round((i * (frames.length - 1)) / (maxCount - 1));
    result.push(frames[idx]);
  }
  return result;
}

/**
 * フレーム数に応じた最適列数・行数の計算
 */
function computeGrid(n) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  return { cols, rows };
}

/**
 * フレームの指定幅へのリサイズ
 */
function scaleFrameToWidth(frame, targetWidth) {
  if (!targetWidth || frame.width === targetWidth) return frame;
  const scale = targetWidth / frame.width;
  const targetHeight = Math.max(1, Math.round(frame.height * scale));
  const c = document.createElement('canvas');
  c.width = targetWidth;
  c.height = targetHeight;
  c.getContext('2d').drawImage(frame, 0, 0, targetWidth, targetHeight);
  return c;
}

/**
 * フレーム群からのスプライトシート結合描画
 */
function composeSpriteSheet(frames, opts) {
  const workingFrames = opts.cellWidth
    ? frames.map((f) => scaleFrameToWidth(f, opts.cellWidth))
    : frames;
  const n = workingFrames.length;
  const { cols, rows } = computeGrid(n);
  const cellW =
    opts.cellWidth || Math.max(...workingFrames.map((f) => f.width));
  const cellH = Math.max(...workingFrames.map((f) => f.height));
  const canvas = document.createElement('canvas');
  canvas.width = cellW * cols;
  canvas.height = cellH * rows;
  const ctx = canvas.getContext('2d');
  if (opts.bgMode !== 'transparent') {
    ctx.fillStyle = opts.bgColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  workingFrames.forEach((frame, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * cellW + (cellW - frame.width) / 2;
    const y = row * cellH + (cellH - frame.height) / 2;
    ctx.drawImage(frame, x, y);
  });
  return { canvas, cols, rows, cellW, cellH };
}

/**
 * 最大公約数（GCD）の計算
 */
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * 画像サイズからの最適アスペクト比・グリッド推定
 */
function guessGrid(width, height) {
  const g = gcd(width, height);
  const cols = width / g;
  const rows = height / g;
  if (
    !Number.isFinite(cols) ||
    !Number.isFinite(rows) ||
    cols < 1 ||
    rows < 1 ||
    cols > 32 ||
    rows > 32
  ) {
    return { cols: 1, rows: 1 };
  }
  return { cols, rows };
}

/**
 * サムネイル表示用サブコンポーネント
 *
 * @param {Object} props コンポーネントのプロパティ
 * @param {HTMLCanvasElement} props.frameCanvas 表示対象のフレームCanvas
 * @return {JSX.Element} サムネイルCanvas要素
 */
// サムネイルCanvasの一辺のサイズ(px)。CSSの .thumb-item canvas と一致させる
const THUMB_SIZE = 80;

function ThumbCanvas({ frameCanvas }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const thumbCanvas = canvasRef.current;
    if (!thumbCanvas || !frameCanvas) return;
    thumbCanvas.width = THUMB_SIZE;
    thumbCanvas.height = THUMB_SIZE;
    const ctx = thumbCanvas.getContext('2d');
    ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
    const scale = Math.min(
      THUMB_SIZE / frameCanvas.width,
      THUMB_SIZE / frameCanvas.height
    );
    const w = frameCanvas.width * scale;
    const h = frameCanvas.height * scale;
    ctx.drawImage(
      frameCanvas,
      (THUMB_SIZE - w) / 2,
      (THUMB_SIZE - h) / 2,
      w,
      h
    );
  }, [frameCanvas]);

  return <canvas ref={canvasRef} />;
}

/**
 * VFXスプライトシート作成ツールのメインReactコンポーネント
 *
 * @return {JSX.Element} VFXスプライトシートツールUI
 */
export default function VfxSpritesheetTool() {
  // 元フレームおよび間引き後の動作フレーム一覧
  const [rawFrames, setRawFrames] = useState([]);
  const [frames, setFrames] = useState([]);

  // 設定オプション
  const [videoFps, setVideoFps] = useState(12);
  const [maxFramesInput, setMaxFramesInput] = useState('');
  const [cellWidthInput, setCellWidthInput] = useState('');
  const [bgMode, setBgMode] = useState('transparent');
  const [bgCustomColor, setBgCustomColor] = useState('#00ff00');
  const [outputFilename, setOutputFilename] = useState('spritesheet');
  const [exportMeta, setExportMeta] = useState(true);

  // ステータス表示
  const [statusMsg, setStatusMsg] = useState('');
  const [statusKind, setStatusKind] = useState('');

  // ドラッグオーバー状態
  const [isDragOver, setIsDragOver] = useState(false);
  const [isAnimDragOver, setIsAnimDragOver] = useState(false);

  // アニメーションプレビュー状態
  const [animState, setAnimState] = useState({
    img: null,
    frameIndex: 0,
    playing: false,
    cols: 1,
    rows: 1,
    fps: 12,
    statusText: '',
  });

  const fileInputRef = useRef(null);
  const animFileInputRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const animCanvasRef = useRef(null);
  const animTimerRef = useRef(null);

  /**
   * ステータスメッセージの更新
   */
  const setStatus = (msg, kind = '') => {
    setStatusMsg(msg);
    setStatusKind(kind);
  };

  /**
   * 現在のスプライトシート合成オプションの取得
   */
  const getComposeOptions = useCallback(() => {
    const color =
      bgMode === 'white'
        ? '#ffffff'
        : bgMode === 'black'
          ? '#000000'
          : bgCustomColor;
    const cwRaw = cellWidthInput.trim();
    const cellWidth = cwRaw ? Math.max(1, parseInt(cwRaw, 10)) : null;
    return { bgMode, bgColor: color, cellWidth };
  }, [bgMode, bgCustomColor, cellWidthInput]);

  // プレビュー再合成の遅延時間(ms)。連続入力時の再計算を抑制する
  const PREVIEW_DEBOUNCE_MS = 150;

  /**
   * 間引き処理の適用
   */
  const applyThinning = useCallback(() => {
    const raw = maxFramesInput.trim();
    const maxVal = raw ? parseInt(raw, 10) : null;
    const result = thinFrames(rawFrames, maxVal);
    setFrames(result);
  }, [rawFrames, maxFramesInput]);

  // 最新の間引き処理を保持する。入力途中の再実行を避けるためRefを使う
  const applyThinningRef = useRef(applyThinning);
  applyThinningRef.current = applyThinning;

  // 新しい素材を読み込んだときだけ間引きを自動適用する。
  // 手動の並び替え・削除結果を維持するため、設定変更では再適用しない
  useEffect(() => {
    applyThinningRef.current();
  }, [rawFrames]);

  /**
   * スプライトシート全体プレビューのレンダリング
   */
  const renderPreview = useCallback(() => {
    const canvasEl = previewCanvasRef.current;
    if (!canvasEl) return;
    if (frames.length === 0) {
      canvasEl.width = 0;
      canvasEl.height = 0;
      return;
    }
    const { canvas } = composeSpriteSheet(frames, getComposeOptions());
    canvasEl.width = canvas.width;
    canvasEl.height = canvas.height;
    canvasEl.getContext('2d').drawImage(canvas, 0, 0);
  }, [frames, getComposeOptions]);

  useEffect(() => {
    const timerId = setTimeout(renderPreview, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timerId);
  }, [renderPreview]);

  /**
   * ドラッグ＆ドロップファイル処理
   */
  const handleFiles = async (fileList) => {
    const files = Array.from(fileList);
    if (!files || files.length === 0) return;
    setStatus('読み込み中…');
    try {
      const first = files[0];
      const isGif =
        files.length === 1 &&
        (first.type === 'image/gif' || /\.gif$/i.test(first.name));
      const isVideo =
        files.length === 1 &&
        (first.type.startsWith('video/') ||
          /\.(mp4|webm|mov|m4v)$/i.test(first.name));

      if (isGif) {
        const buf = await first.arrayBuffer();
        const extracted = await decodeGif(buf);
        setRawFrames(extracted);
        setStatus(`GIFから ${extracted.length} フレームを抽出しました`, 'ok');
      } else if (isVideo) {
        const extracted = await extractVideoFrames(first, videoFps);
        setRawFrames(extracted);
        setStatus(
          `動画から ${extracted.length} フレームを抽出しました (指定: ${videoFps}fps)`,
          'ok'
        );
      } else {
        const imageFiles = files.filter(
          (f) => f.type.startsWith('image/') && !/\.gif$/i.test(f.name)
        );
        if (imageFiles.length === 0)
          throw new Error('対応する画像ファイルが見つかりませんでした');
        const extracted = await loadImageSequence(imageFiles);
        setRawFrames(extracted);
        setStatus(`${extracted.length} 枚の連番画像を読み込みました`, 'ok');
      }
    } catch (err) {
      console.error(err);
      setStatus('エラー: ' + err.message, 'error');
    }
  };

  /**
   * フレームの並び順移動
   */
  const moveFrame = (from, to) => {
    if (to < 0 || to >= frames.length) return;
    setFrames((prev) => {
      const next = prev.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  /**
   * フレームの個別に削除
   */
  const removeFrame = (index) => {
    setFrames((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * Blobファイルの安全なダウンロード処理
   */
  const downloadBlob = (blob, name) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /**
   * スプライトシート（PNG / JSON）の書き出し実行
   */
  const handleExport = () => {
    if (frames.length === 0) return;
    const { canvas, cols, rows, cellW, cellH } = composeSpriteSheet(
      frames,
      getComposeOptions()
    );
    const baseName = outputFilename.trim() || 'spritesheet';

    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus('PNGの生成に失敗しました', 'error');
        return;
      }
      downloadBlob(blob, `${baseName}.png`);
      if (exportMeta) {
        const meta = {
          frameCount: frames.length,
          columns: cols,
          rows: rows,
          cellWidth: cellW,
          cellHeight: cellH,
          sheetWidth: canvas.width,
          sheetHeight: canvas.height,
        };
        downloadBlob(
          new Blob([JSON.stringify(meta, null, 2)], {
            type: 'application/json',
          }),
          `${baseName}.json`
        );
      }
      setStatus('書き出しが完了しました', 'ok');
    }, 'image/png');
  };

  /**
   * アニメーションプレビューフレーム描画
   */
  const drawAnimFrame = useCallback(() => {
    if (!animState.img || !animCanvasRef.current) return;
    const img = animState.img;
    const cols = Math.max(1, animState.cols);
    const rows = Math.max(1, animState.rows);
    // Canvasの寸法は整数のみ有効。描画のずれを防ぐため切り捨てで統一する
    const cellW = Math.floor(img.naturalWidth / cols);
    const cellH = Math.floor(img.naturalHeight / rows);
    if (cellW < 1 || cellH < 1) return;
    const total = cols * rows;
    const curIndex = animState.frameIndex >= total ? 0 : animState.frameIndex;
    const col = curIndex % cols;
    const row = Math.floor(curIndex / cols);

    const canvas = animCanvasRef.current;
    canvas.width = cellW;
    canvas.height = cellH;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, cellW, cellH);
    ctx.drawImage(
      img,
      col * cellW,
      row * cellH,
      cellW,
      cellH,
      0,
      0,
      cellW,
      cellH
    );
  }, [animState]);

  useEffect(() => {
    drawAnimFrame();
  }, [drawAnimFrame]);

  /**
   * アニメーション再生の停止
   */
  const stopAnimPlayback = useCallback(() => {
    if (animTimerRef.current) {
      clearInterval(animTimerRef.current);
      animTimerRef.current = null;
    }
    setAnimState((prev) => ({ ...prev, playing: false }));
  }, []);

  /**
   * アニメーション再生の開始
   */
  const startAnimPlayback = useCallback(() => {
    if (!animState.img) return;
    setAnimState((prev) => ({ ...prev, playing: true }));
  }, [animState.img]);

  // アニメーション再生タイマーの動的更新（FPS変更のリアルタイム反映）
  useEffect(() => {
    if (!animState.playing || !animState.img) return;
    const interval = 1000 / Math.max(1, animState.fps);
    animTimerRef.current = setInterval(() => {
      setAnimState((prev) => {
        const total = Math.max(1, prev.cols) * Math.max(1, prev.rows);
        return { ...prev, frameIndex: (prev.frameIndex + 1) % total };
      });
    }, interval);

    return () => {
      if (animTimerRef.current) {
        clearInterval(animTimerRef.current);
        animTimerRef.current = null;
      }
    };
  }, [animState.playing, animState.img, animState.fps]);

  /**
   * スプライトシート画像ファイルのロード（JSONのメタデータ優先連動対応）
   */
  const loadSpriteSheetFile = (imgFile, jsonMeta = null) => {
    stopAnimPlayback();
    const url = URL.createObjectURL(imgFile);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const cols =
        jsonMeta?.columns ||
        guessGrid(img.naturalWidth, img.naturalHeight).cols;
      const rows =
        jsonMeta?.rows || guessGrid(img.naturalWidth, img.naturalHeight).rows;
      setAnimState({
        img,
        frameIndex: 0,
        playing: false,
        cols,
        rows,
        fps: 12,
        statusText: jsonMeta
          ? `${img.naturalWidth}×${img.naturalHeight}px / JSONメタデータ適用 (${cols}列×${rows}行)`
          : `${img.naturalWidth}×${img.naturalHeight}px / 推定 ${cols}列×${rows}行(手動調整可)`,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setAnimState((prev) => ({
        ...prev,
        statusText: 'エラー: 画像の読み込みに失敗しました',
      }));
    };
    img.src = url;
  };

  /**
   * ドロップまたは選択されたファイル群（画像＋オプションJSON）の解析とロード
   * @param {FileList|File[]} fileList ファイルリスト
   */
  const loadSpriteSheetFiles = async (fileList) => {
    const files = Array.from(fileList);
    if (!files || files.length === 0) return;
    const imgFile = files.find((f) => f.type.startsWith('image/'));
    const jsonFile = files.find(
      (f) => f.type === 'application/json' || /\.json$/i.test(f.name)
    );

    if (!imgFile) {
      setAnimState((prev) => ({
        ...prev,
        statusText: 'エラー: 画像ファイルが見つかりません',
      }));
      return;
    }

    let jsonMeta = null;
    if (jsonFile) {
      try {
        const text = await jsonFile.text();
        const parsed = JSON.parse(text);
        if (
          Number.isInteger(parsed.columns) &&
          parsed.columns >= 1 &&
          Number.isInteger(parsed.rows) &&
          parsed.rows >= 1
        ) {
          jsonMeta = parsed;
        }
      } catch (e) {
        console.warn('JSONメタデータの解析に失敗しました:', e);
      }
    }

    loadSpriteSheetFile(imgFile, jsonMeta);
  };

  const gridInfoText =
    frames.length === 0
      ? '-'
      : (() => {
          const { cols, rows } = computeGrid(frames.length);
          return `${cols} 列 × ${rows} 行 (${frames.length} フレーム)`;
        })();

  return (
    <div className="vfx-spritesheet-container">
      <h1>VFX スプライトシート作成ツール</h1>
      <div className="subtitle">
        連番画像 / GIF / MP4動画
        から、フレームをグリッド状に並べたスプライトシート(PNG)を作成します。すべてブラウザ内で完結し、外部送信は行いません。
      </div>

      <main>
        {/* 左カラム：設定およびコントロール */}
        <div className="left-col">
          <section>
            <h2>入力</h2>
            <div
              className={`dropzone ${isDragOver ? 'dragover' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragOver(true);
              }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragOver(false);
                handleFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
            >
              <b>ここにドラッグ&ドロップ</b>
              <div>連番画像(複数) / GIFアニメ / 動画(MP4等)</div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,video/*"
                style={{ display: 'none' }}
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = '';
                }}
              />
            </div>
            <div className={`status-bar ${statusKind}`}>{statusMsg}</div>
          </section>

          <section>
            <h2>フレーム調整</h2>
            <div className="field">
              <label>動画抽出FPS (動画ファイル時のみ)</label>
              <input
                type="number"
                min="1"
                max="60"
                value={videoFps}
                onChange={(e) => setVideoFps(parseFloat(e.target.value) || 12)}
              />
            </div>
            <div className="field">
              <label>最大フレーム数 (間引き設定・空欄で全件)</label>
              <div className="row">
                <input
                  type="number"
                  placeholder="例: 16"
                  value={maxFramesInput}
                  onChange={(e) => setMaxFramesInput(e.target.value)}
                />
                <button type="button" onClick={applyThinning}>
                  間引き適用
                </button>
              </div>
            </div>
            <div className="field">
              <button type="button" onClick={applyThinning}>
                手動削除・並び順をリセット
              </button>
            </div>
          </section>

          <section>
            <h2>スプライトシート設定</h2>
            <div className="field">
              <label>背景モード</label>
              <select
                value={bgMode}
                onChange={(e) => setBgMode(e.target.value)}
              >
                <option value="transparent">透過 (PNGアルファ)</option>
                <option value="black">黒背景 (#000000)</option>
                <option value="white">白背景 (#ffffff)</option>
                <option value="custom">カスタム色 (クロマキー用)</option>
              </select>
            </div>
            {bgMode === 'custom' && (
              <div className="field">
                <label>カスタム背景色</label>
                <input
                  type="color"
                  value={bgCustomColor}
                  onChange={(e) => setBgCustomColor(e.target.value)}
                />
              </div>
            )}
            <div className="field">
              <label>1コマの横幅(px) (空欄で元解像度)</label>
              <input
                type="number"
                placeholder="例: 128"
                value={cellWidthInput}
                onChange={(e) => setCellWidthInput(e.target.value)}
              />
            </div>
          </section>

          <section>
            <h2>書き出し</h2>
            <div className="field">
              <label>ファイル名 (拡張子なし)</label>
              <input
                type="text"
                value={outputFilename}
                onChange={(e) => setOutputFilename(e.target.value)}
              />
            </div>
            <div className="field checkbox-row">
              <input
                type="checkbox"
                id="export-meta"
                checked={exportMeta}
                onChange={(e) => setExportMeta(e.target.checked)}
              />
              <label htmlFor="export-meta">メタデータ (.json) も同時出力</label>
            </div>
            <button
              type="button"
              className="primary"
              disabled={frames.length === 0}
              onClick={handleExport}
              style={{ width: '100%' }}
            >
              スプライトシート(PNG)を保存
            </button>
          </section>
        </div>

        {/* 右カラム：プレビューおよびサムネイル */}
        <div className="right-col">
          <section>
            <h2>フレーム一覧 ({frames.length}コマ)</h2>
            <div className="thumbnails">
              {frames.length === 0 ? (
                <div className="empty-hint">まだフレームがありません</div>
              ) : (
                frames.map((canvas, i) => (
                  <div key={i} className="thumb-item">
                    <div className="thumb-label">#{i + 1}</div>
                    <ThumbCanvas frameCanvas={canvas} />
                    <div className="thumb-controls">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => moveFrame(i, i - 1)}
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        disabled={i === frames.length - 1}
                        onClick={() => moveFrame(i, i + 1)}
                      >
                        →
                      </button>
                      <button type="button" onClick={() => removeFrame(i)}>
                        ✕
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section>
            <h2>
              スプライトシート プレビュー (
              <span className="grid-info">{gridInfoText}</span>)
            </h2>
            <div className="checker-bg">
              <canvas ref={previewCanvasRef} className="preview-canvas" />
            </div>
          </section>

          <section>
            <h2>スプライトシート アニメーション確認 (動作テスト)</h2>
            <div
              style={{
                display: 'flex',
                gap: '16px',
                flexWrap: 'wrap',
                alignItems: 'flex-start',
              }}
            >
              <div
                className={`anim-dropzone ${isAnimDragOver ? 'dragover' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsAnimDragOver(true);
                }}
                onDragLeave={() => setIsAnimDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsAnimDragOver(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    loadSpriteSheetFiles(e.dataTransfer.files);
                  }
                }}
                onClick={() => animFileInputRef.current?.click()}
              >
                <b>作成済みスプライトシートをドロップ</b>
                <input
                  ref={animFileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/json,.json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      loadSpriteSheetFiles(e.target.files);
                    }
                    e.target.value = '';
                  }}
                />
              </div>
              <div className="anim-controls">
                <div className="field">
                  <div className="row">
                    <div>
                      <label>列数 (cols)</label>
                      <input
                        type="number"
                        min="1"
                        value={animState.cols}
                        onChange={(e) =>
                          setAnimState((prev) => ({
                            ...prev,
                            cols: Math.max(
                              1,
                              parseInt(e.target.value, 10) || 1
                            ),
                            frameIndex: 0,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label>行数 (rows)</label>
                      <input
                        type="number"
                        min="1"
                        value={animState.rows}
                        onChange={(e) =>
                          setAnimState((prev) => ({
                            ...prev,
                            rows: Math.max(
                              1,
                              parseInt(e.target.value, 10) || 1
                            ),
                            frameIndex: 0,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label>再生FPS</label>
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={animState.fps}
                        onChange={(e) =>
                          setAnimState((prev) => ({
                            ...prev,
                            fps: Math.max(1, parseFloat(e.target.value) || 12),
                          }))
                        }
                      />
                    </div>
                  </div>
                </div>
                <div
                  className="field"
                  style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                >
                  <button
                    type="button"
                    disabled={!animState.img}
                    onClick={() => {
                      if (animState.playing) stopAnimPlayback();
                      else startAnimPlayback();
                    }}
                  >
                    {animState.playing ? '停止' : '再生'}
                  </button>
                  <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                    {animState.statusText}
                  </span>
                </div>
                <div className="checker-bg">
                  <canvas ref={animCanvasRef} className="anim-preview-canvas" />
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
