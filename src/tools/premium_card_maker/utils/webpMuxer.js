/**
 * Mini Card Battle - Client-Side Animated WebP Muxer
 *
 * ブラウザの HTMLCanvasElement からフレームを静止画WebPとして抽出し、
 * ピュア JavaScript で RIFF/VP8X/ANIM/ANMF コンテナを組み立てて
 * アニメーション WebP (image/webp Blob) を生成する軽量ユーティリティ。
 */

/**
 * 単一の Canvas 要素から WebP 形式の ArrayBuffer を取得します。
 *
 * @param {HTMLCanvasElement} canvas - 変換対象の Canvas 要素
 * @param {number} [quality=0.8] - WebP 圧縮品質（0.0 〜 1.0）
 * @returns {Promise<ArrayBuffer>} WebP バイナリデータ
 */
export async function canvasToWebpArrayBuffer(canvas, quality = 0.8) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Canvas から WebP Blob の生成に失敗しました'));
          return;
        }
        blob.arrayBuffer().then(resolve).catch(reject);
      },
      'image/webp',
      quality
    );
  });
}

/**
 * WebP バッファからビットストリーム（VP8 / VP8L / ALPH）チャンク群を抽出します。
 *
 * @param {ArrayBuffer} arrayBuffer - 静止画 WebP の ArrayBuffer
 * @returns {Uint8Array} 結合されたビットストリームチャンクバイナリ
 */
export function extractBitstreamChunks(arrayBuffer) {
  const data = new Uint8Array(arrayBuffer);
  const view = new DataView(arrayBuffer);

  // RIFF ヘッダ検証 ('RIFF' .... 'WEBP')
  const riff = String.fromCharCode(...data.subarray(0, 4));
  const webp = String.fromCharCode(...data.subarray(8, 12));
  if (riff !== 'RIFF' || webp !== 'WEBP') {
    throw new Error('有効な WebP バイナリではありません');
  }

  let pos = 12;
  const chunkSlices = [];

  while (pos + 8 <= data.length) {
    const fourcc = String.fromCharCode(...data.subarray(pos, pos + 4));
    const chunkSize = view.getUint32(pos + 4, true);
    const totalChunkLength = 8 + chunkSize + (chunkSize % 2); // 偶数アラインメント

    if (['VP8 ', 'VP8L', 'ALPH'].includes(fourcc)) {
      chunkSlices.push(data.subarray(pos, pos + totalChunkLength));
    }

    pos += totalChunkLength;
  }

  // 抽出したチャンクを 1 つの Uint8Array に結合
  const totalLength = chunkSlices.reduce((sum, slice) => sum + slice.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const slice of chunkSlices) {
    result.set(slice, offset);
    offset += slice.length;
  }

  return result;
}

/**
 * 複数の Canvas フレームからアニメーション WebP の Blob を生成します。
 *
 * @param {Array<HTMLCanvasElement|{canvas: HTMLCanvasElement, durationMs?: number}>} frames - フレーム情報配列
 * @param {Object} [options={}] - エンコードオプション
 * @param {number} [options.width=400] - アニメーションの横幅 (px)
 * @param {number} [options.height=600] - アニメーションの高さ (px)
 * @param {number} [options.fps=15] - デフォルトフレームレート（frame.durationMs 未指定時に使用）
 * @param {number} [options.loopCount=0] - ループ回数（0 = 無限ループ、1 = 1回再生）
 * @param {number} [options.quality=0.7] - 圧縮品質（0.0 〜 1.0）
 * @param {function(number, number): void} [options.onProgress] - 進捗コールバック (current, total)
 * @returns {Promise<Blob>} 完成したアニメーション WebP の Blob
 */
export async function createAnimatedWebpBlob(frames, options = {}) {
  if (!Array.isArray(frames) || frames.length === 0) {
    throw new Error('エンコード対象のフレームが存在しません');
  }

  const width = options.width || 400;
  const height = options.height || 600;
  const fps = options.fps || 15;
  const defaultDurationMs = Math.round(1000 / fps);
  const loopCount =
    typeof options.loopCount === 'number' ? options.loopCount : 0;
  const quality = typeof options.quality === 'number' ? options.quality : 0.7;
  const onProgress =
    typeof options.onProgress === 'function' ? options.onProgress : null;

  // 1. 各フレームの Canvas を WebP エンコードし、ビットストリームチャンクを抽出
  const framePayloads = [];

  for (let i = 0; i < frames.length; i++) {
    const item = frames[i];
    const canvas = item.canvas ? item.canvas : item;
    const durationMs = item.durationMs || defaultDurationMs;

    if (onProgress) {
      onProgress(i + 1, frames.length);
    }

    const rawBuf = await canvasToWebpArrayBuffer(canvas, quality);
    const bitstream = extractBitstreamChunks(rawBuf);
    framePayloads.push({ bitstream, durationMs });
  }

  // 2. VP8X チャンク生成 (10 bytes ペイロード + 8 bytes ヘッダ)
  const vp8xPayload = new Uint8Array(10);
  vp8xPayload[0] = 0x02; // Flags: Animation bit (bit 1) 有効

  // Canvas 幅 - 1 (24-bit uint LE)
  const wMinus1 = width - 1;
  vp8xPayload[4] = wMinus1 & 0xff;
  vp8xPayload[5] = (wMinus1 >> 8) & 0xff;
  vp8xPayload[6] = (wMinus1 >> 16) & 0xff;

  // Canvas 高さ - 1 (24-bit uint LE)
  const hMinus1 = height - 1;
  vp8xPayload[7] = hMinus1 & 0xff;
  vp8xPayload[8] = (hMinus1 >> 8) & 0xff;
  vp8xPayload[9] = (hMinus1 >> 16) & 0xff;

  const vp8xChunk = createChunk('VP8X', vp8xPayload);

  // 3. ANIM チャンク生成 (6 bytes ペイロード + 8 bytes ヘッダ)
  const animPayload = new Uint8Array(6);
  const animView = new DataView(animPayload.buffer);
  animView.setUint32(0, 0x00000000, true); // 背景色 (BGRA = 0, 透明)
  animView.setUint16(4, loopCount, true); // ループ回数 (0 = 無限ループ)

  const animChunk = createChunk('ANIM', animPayload);

  // 4. ANMF チャンク群の生成
  const anmfChunks = [];
  for (const { bitstream, durationMs } of framePayloads) {
    const anmfHeader = new Uint8Array(16);

    // Frame X offset: 0 (3 bytes)
    // Frame Y offset: 0 (3 bytes)
    // Frame Width - 1 (3 bytes)
    anmfHeader[6] = wMinus1 & 0xff;
    anmfHeader[7] = (wMinus1 >> 8) & 0xff;
    anmfHeader[8] = (wMinus1 >> 16) & 0xff;

    // Frame Height - 1 (3 bytes)
    anmfHeader[9] = hMinus1 & 0xff;
    anmfHeader[10] = (hMinus1 >> 8) & 0xff;
    anmfHeader[11] = (hMinus1 >> 16) & 0xff;

    // Frame Duration (3 bytes LE)
    const dur = Math.max(1, Math.round(durationMs));
    anmfHeader[12] = dur & 0xff;
    anmfHeader[13] = (dur >> 8) & 0xff;
    anmfHeader[14] = (dur >> 16) & 0xff;

    // Flags: 0x02 = dispose to background / no blending (完全上書き更新)
    anmfHeader[15] = 0x02;

    // ANMF ペイロード = ヘッダ(16 bytes) + フレームビットストリーム
    const payload = concatUint8Arrays([anmfHeader, bitstream]);
    const anmfChunk = createChunk('ANMF', payload);
    anmfChunks.push(anmfChunk);
  }

  // 5. RIFF WEBP ヘッダで全体を包み込む
  const bodyParts = [vp8xChunk, animChunk, ...anmfChunks];
  const bodyTotalLength = bodyParts.reduce((sum, p) => sum + p.length, 0);

  const riffHeader = new Uint8Array(12);
  const riffView = new DataView(riffHeader.buffer);
  riffHeader.set([0x52, 0x49, 0x46, 0x46], 0); // 'RIFF'
  riffView.setUint32(4, bodyTotalLength + 4, true); // 全体サイズ - 8
  riffHeader.set([0x57, 0x45, 0x42, 0x50], 8); // 'WEBP'

  const finalData = concatUint8Arrays([riffHeader, ...bodyParts]);

  return new Blob([finalData], { type: 'image/webp' });
}

/**
 * チャンク名とペイロードからパディング付きの RIFF チャンクバイナリを作成します。
 *
 * @param {string} fourcc - 4文字のチャンク識別子
 * @param {Uint8Array} payload - チャンクのペイロードバイナリ
 * @returns {Uint8Array} ヘッダおよびパディングを含む完全なチャンクデータ
 */
function createChunk(fourcc, payload) {
  const size = payload.length;
  const paddingSize = size % 2;
  const chunk = new Uint8Array(8 + size + paddingSize);
  const view = new DataView(chunk.buffer);

  for (let i = 0; i < 4; i++) {
    chunk[i] = fourcc.charCodeAt(i);
  }
  view.setUint32(4, size, true);
  chunk.set(payload, 8);
  if (paddingSize > 0) {
    chunk[8 + size] = 0;
  }

  return chunk;
}

/**
 * 複数の Uint8Array を 1 つの Uint8Array に結合します。
 *
 * @param {Uint8Array[]} arrays - 結合対象の配列リスト
 * @returns {Uint8Array} 結合後の Uint8Array
 */
function concatUint8Arrays(arrays) {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}
