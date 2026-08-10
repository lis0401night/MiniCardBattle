import { useState, useEffect, useRef, useCallback } from 'react';
import pica from 'pica';
import '../common/toolNavStandalone.js';
import './CharaAssetMaker.css';

/**
 * Picaライブラリのインスタンス（画像リサイズ用）
 */
const picaInstance = pica();

/**
 * Picaオプションのローカルストレージ保持キー
 */
const PICA_OPTIONS_KEY = 'chara_assetmaker.picaOptions';

/**
 * Picaの初期設定値
 */
const PICA_DEFAULTS = {
  quality: 3,
  filter: 'lanczos3',
  unsharpAmount: 0,
  unsharpRadius: 0.5,
  unsharpThreshold: 0,
};

/**
 * 出力ターゲットの解像度および切り出し仕様定義
 */
const TARGET_SPECS = {
  char: {
    id: 'char',
    label: 'char_',
    specText: '(800×1200)',
    w: 800,
    h: 1200,
    circular: false,
    sourceOf: 'A',
  },
  board: {
    id: 'board',
    label: 'board_',
    specText: '(400×200)',
    w: 400,
    h: 200,
    circular: false,
    sourceOf: 'A',
  },
  icon: {
    id: 'icon',
    label: 'icon_',
    specText: '(200×200・円形)',
    w: 200,
    h: 200,
    circular: true,
    sourceOf: 'A',
  },
  iconDamage: {
    id: 'iconDamage',
    label: 'icon_',
    suffix: '_damage',
    specText: '(200×200・円形)',
    w: 200,
    h: 200,
    circular: true,
    sourceOf: 'B',
  },
};

/**
 * アイコン描画時の円形クリッピング設定値
 */
const ICON_CIRCLE = {
  diameterRatio: 0.955,
  centerXRatio: 0.5,
  centerYRatio: 0.5,
};

/**
 * ズームの最大倍率（最小スケールに対する乗数）
 */
const MAX_ZOOM_MULTIPLIER = 8;

/**
 * デフォルトのアンカー位置（縦方向）
 */
const DEFAULT_ANCHOR_Y = 0.3;

/**
 * キャラクターアセット書き出しツールのメインReactコンポーネント
 *
 * @return {JSX.Element} アセット書き出しツールUI
 */
export default function CharaAssetMaker() {
  // 画像アセット（A: 通常時, B: ダメージ時）
  const [images, setImages] = useState({ A: null, B: null });

  // ファイル名（プレフィックス slug）
  const [nameSlug, setNameSlug] = useState('dragon');

  // 出力画像フォーマット ('webp' または 'png')
  const [format, setFormat] = useState('webp');

  // ダメージアイコンのリンク設定
  const [isLinked, setIsLinked] = useState(true);

  // Picaの設定状態
  const [picaOptions, setPicaOptions] = useState(() => {
    try {
      const raw = localStorage.getItem(PICA_OPTIONS_KEY);
      if (!raw) return { ...PICA_DEFAULTS };
      return { ...PICA_DEFAULTS, ...JSON.parse(raw) };
    } catch {
      return { ...PICA_DEFAULTS };
    }
  });

  // 各レイヤー（char, board, icon, iconDamage）の変換パラメータ状態
  const [transforms, setTransforms] = useState({
    char: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      minScale: 1,
      maxScale: 1,
      sliderValue: 0,
    },
    board: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      minScale: 1,
      maxScale: 1,
      sliderValue: 0,
    },
    icon: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      minScale: 1,
      maxScale: 1,
      sliderValue: 0,
    },
    iconDamage: {
      scale: 1,
      offsetX: 0,
      offsetY: 0,
      minScale: 1,
      maxScale: 1,
      sliderValue: 0,
    },
  });

  // 各キャンバスのDOM参照
  const canvasRefs = {
    char: useRef(null),
    board: useRef(null),
    icon: useRef(null),
    iconDamage: useRef(null),
  };

  // ドラッグ操作の一時記憶Ref
  const dragStartRef = useRef(null);

  /**
   * Picaの設定変更およびローカルストレージ更新
   *
   * @param {string} key 設定項目のキー
   * @param {string|number} value 変更後の値
   */
  const handlePicaOptionChange = (key, value) => {
    setPicaOptions((prev) => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(PICA_OPTIONS_KEY, JSON.stringify(next));
      return next;
    });
  };

  /**
   * Pica設定をデフォルト値にリセット
   */
  const handleResetPicaOptions = () => {
    setPicaOptions({ ...PICA_DEFAULTS });
    localStorage.setItem(PICA_OPTIONS_KEY, JSON.stringify(PICA_DEFAULTS));
  };

  /**
   * 対象切り出し領域（円形または矩形）の計算
   *
   * @param {Object} spec レイヤーの仕様情報
   * @return {Object} 包含矩形座標
   */
  const computeCoverRect = useCallback((spec) => {
    if (!spec.circular) {
      return { x0: 0, y0: 0, x1: spec.w, y1: spec.h, w: spec.w, h: spec.h };
    }
    const r = (spec.w * ICON_CIRCLE.diameterRatio) / 2;
    const cx = spec.w * ICON_CIRCLE.centerXRatio;
    const cy = spec.h * ICON_CIRCLE.centerYRatio;
    return {
      x0: cx - r,
      y0: cy - r,
      x1: cx + r,
      y1: cy + r,
      w: r * 2,
      h: r * 2,
    };
  }, []);

  /**
   * 初期配置時における画像のスケーリングおよびオフセット計算
   *
   * @param {number} sw 元画像の幅
   * @param {number} sh 元画像の高さ
   * @param {Object} coverRect 切り出し領域
   * @param {number} anchorYRatio 縦方向のアンカー比率
   * @return {Object} 初期変換行列（scale, offsetX, offsetY）
   */
  const computeInitialTransform = useCallback(
    (sw, sh, coverRect, anchorYRatio) => {
      const scale = Math.max(coverRect.w / sw, coverRect.h / sh);
      const scaledW = sw * scale;
      const scaledH = sh * scale;
      const offsetX = coverRect.x0 + (coverRect.w - scaledW) / 2;
      let offsetY = coverRect.y0 + coverRect.h / 2 - anchorYRatio * sh * scale;
      const minOffsetY = coverRect.y1 - scaledH;
      const maxOffsetY = coverRect.y0;
      offsetY = Math.min(maxOffsetY, Math.max(minOffsetY, offsetY));
      return { scale, offsetX, offsetY };
    },
    []
  );

  /**
   * 変換パラメータが領域外へはみ出さないように補正（クランプ処理）
   *
   * @param {Object} spec レイヤー仕様
   * @param {HTMLImageElement} img 元画像
   * @param {Object} transform 変換オブジェクト
   * @param {number} minScale 最小スケール
   * @param {number} maxScale 最大スケール
   * @return {Object} 補正後の変換オブジェクト
   */
  const clampTransform = useCallback(
    (spec, img, transform, minScale, maxScale) => {
      if (!img) return transform;
      const coverRect = computeCoverRect(spec);
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      let { scale, offsetX, offsetY } = transform;
      scale = Math.min(maxScale, Math.max(minScale, scale));
      offsetX = Math.min(
        coverRect.x0,
        Math.max(coverRect.x1 - sw * scale, offsetX)
      );
      offsetY = Math.min(
        coverRect.y0,
        Math.max(coverRect.y1 - sh * scale, offsetY)
      );
      return { scale, offsetX, offsetY };
    },
    [computeCoverRect]
  );

  /**
   * スケール値からスライダー比率（0〜1）を算出
   *
   * @param {number} scale 現在のスケール
   * @param {number} minScale 最小スケール
   * @return {number} スライダー値 (0..1)
   */
  const computeSliderFromScale = (scale, minScale) => {
    if (!minScale || minScale <= 0) return 0;
    const ratio = scale / minScale;
    const val = Math.log(ratio) / Math.log(MAX_ZOOM_MULTIPLIER);
    return Math.min(1, Math.max(0, val));
  };

  /**
   * キャンバスへの画像描画レンダリング処理
   *
   * @param {string} id レイヤーID
   */
  const renderCanvas = useCallback(
    (id) => {
      const spec = TARGET_SPECS[id];
      const canvas = canvasRefs[id].current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, spec.w, spec.h);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      if (spec.circular) {
        ctx.save();
        ctx.beginPath();
        const r = (spec.w * ICON_CIRCLE.diameterRatio) / 2;
        ctx.arc(
          spec.w * ICON_CIRCLE.centerXRatio,
          spec.h * ICON_CIRCLE.centerYRatio,
          r,
          0,
          Math.PI * 2
        );
        ctx.clip();
      }

      const imgSlot = spec.sourceOf;
      const img = images[imgSlot];
      const t = transforms[id];

      if (img && t) {
        ctx.drawImage(
          img,
          t.offsetX,
          t.offsetY,
          img.naturalWidth * t.scale,
          img.naturalHeight * t.scale
        );
      } else {
        ctx.fillStyle = '#cdd0d6';
        ctx.fillRect(0, 0, spec.w, spec.h);
        ctx.fillStyle = '#767b85';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('画像未アップロード', spec.w / 2, spec.h / 2);
      }

      if (spec.circular) {
        ctx.restore();
      }
    },
    [canvasRefs, images, transforms]
  );

  // 画像・変換値の更新に伴うキャンバスの再描画
  useEffect(() => {
    Object.keys(TARGET_SPECS).forEach((id) => {
      renderCanvas(id);
    });
  }, [renderCanvas]);

  /**
   * 特定レイヤーの座標・ズームの初期化リセット
   *
   * @param {string} id レイヤーID
   */
  const resetLayerTransform = useCallback(
    (id) => {
      const spec = TARGET_SPECS[id];
      const img = images[spec.sourceOf];
      if (!img) return;

      const coverRect = computeCoverRect(spec);
      const sw = img.naturalWidth;
      const sh = img.naturalHeight;
      const minScale = Math.max(coverRect.w / sw, coverRect.h / sh);
      const maxScale = minScale * MAX_ZOOM_MULTIPLIER;
      const anchorY = id === 'char' ? 0.5 : DEFAULT_ANCHOR_Y;
      const t = computeInitialTransform(sw, sh, coverRect, anchorY);

      setTransforms((prev) => {
        const nextT = { ...t, minScale, maxScale, sliderValue: 0 };
        const nextTransforms = { ...prev, [id]: nextT };

        // iconDamageがリンク状態の場合、iconの変換状態を反映
        if (id === 'icon' && isLinked && images.B) {
          const dmgSpec = TARGET_SPECS.iconDamage;
          const dmgImg = images.B;
          const dmgMin = Math.max(
            dmgSpec.w / dmgImg.naturalWidth,
            dmgSpec.h / dmgImg.naturalHeight
          );
          const dmgMax = dmgMin * MAX_ZOOM_MULTIPLIER;
          const clampedDmg = clampTransform(
            dmgSpec,
            dmgImg,
            { ...t },
            dmgMin,
            dmgMax
          );
          nextTransforms.iconDamage = {
            ...clampedDmg,
            minScale: dmgMin,
            maxScale: dmgMax,
            sliderValue: computeSliderFromScale(clampedDmg.scale, dmgMin),
          };
        }
        return nextTransforms;
      });
    },
    [
      images,
      isLinked,
      computeCoverRect,
      computeInitialTransform,
      clampTransform,
    ]
  );

  /**
   * 画像ファイルアップロードのハンドラー
   *
   * @param {string} slot 'A' (通常) または 'B' (ダメージ)
   * @param {File} file アップロードされたファイル
   */
  const handleUpload = (slot, file) => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImages((prev) => {
        const nextImages = { ...prev, [slot]: img };
        return nextImages;
      });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      alert('画像の読み込みに失敗しました。別のファイルをお試しぐださい。');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  // 画像ロード完了時の初期変換の設定
  useEffect(() => {
    if (images.A) {
      resetLayerTransform('char');
      resetLayerTransform('board');
      resetLayerTransform('icon');
    }
  }, [images.A, resetLayerTransform]);

  useEffect(() => {
    if (images.B) {
      resetLayerTransform('iconDamage');
    }
  }, [images.B, resetLayerTransform]);

  /**
   * 特定の点を中心としたズーム処理
   *
   * @param {string} id レイヤーID
   * @param {number} px 中心X座標
   * @param {number} py 中心Y座標
   * @param {number} newScaleRaw 変更後の目標スケール
   */
  const setScaleAround = useCallback(
    (id, px, py, newScaleRaw) => {
      const spec = TARGET_SPECS[id];
      const img = images[spec.sourceOf];
      if (!img) return;

      setTransforms((prev) => {
        const cur = prev[id];
        const srcX = (px - cur.offsetX) / cur.scale;
        const srcY = (py - cur.offsetY) / cur.scale;
        const newScale = Math.min(
          cur.maxScale,
          Math.max(cur.minScale, newScaleRaw)
        );
        const nextT = {
          scale: newScale,
          offsetX: px - srcX * newScale,
          offsetY: py - srcY * newScale,
        };
        const clamped = clampTransform(
          spec,
          img,
          nextT,
          cur.minScale,
          cur.maxScale
        );
        const sliderVal = computeSliderFromScale(clamped.scale, cur.minScale);

        const nextState = {
          ...prev,
          [id]: {
            ...clamped,
            minScale: cur.minScale,
            maxScale: cur.maxScale,
            sliderValue: sliderVal,
          },
        };

        if (id === 'icon' && isLinked && images.B) {
          const dmgSpec = TARGET_SPECS.iconDamage;
          const dmgImg = images.B;
          const dmgCur = prev.iconDamage;
          const clampedDmg = clampTransform(
            dmgSpec,
            dmgImg,
            { ...clamped },
            dmgCur.minScale,
            dmgCur.maxScale
          );
          const dmgSliderVal = computeSliderFromScale(
            clampedDmg.scale,
            dmgCur.minScale
          );
          nextState.iconDamage = {
            ...clampedDmg,
            minScale: dmgCur.minScale,
            maxScale: dmgCur.maxScale,
            sliderValue: dmgSliderVal,
          };
        }

        return nextState;
      });
    },
    [images, isLinked, clampTransform]
  );

  /**
   * スライダーによるズーム調整ハンドラー
   *
   * @param {string} id レイヤーID
   * @param {number} val スライダー値 (0..1)
   */
  const handleSliderChange = (id, val) => {
    const spec = TARGET_SPECS[id];
    const cur = transforms[id];
    if (!images[spec.sourceOf]) return;
    const newScale = cur.minScale * Math.pow(MAX_ZOOM_MULTIPLIER, val);
    const coverRect = computeCoverRect(spec);
    const cx = (coverRect.x0 + coverRect.x1) / 2;
    const cy = (coverRect.y0 + coverRect.y1) / 2;
    setScaleAround(id, cx, cy, newScale);
  };

  /**
   * ポインターダウン（ドラッグ開始）
   */
  const handlePointerDown = (id, e) => {
    const spec = TARGET_SPECS[id];
    if (!images[spec.sourceOf]) return;
    e.target.setPointerCapture(e.pointerId);
    const rect = e.target.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (spec.w / rect.width);
    const y = (e.clientY - rect.top) * (spec.h / rect.height);
    const t = transforms[id];
    dragStartRef.current = { id, x, y, offsetX: t.offsetX, offsetY: t.offsetY };
  };

  /**
   * ポインター移動（ドラッグ中）
   */
  const handlePointerMove = (id, e) => {
    if (!dragStartRef.current || dragStartRef.current.id !== id) return;
    const spec = TARGET_SPECS[id];
    const img = images[spec.sourceOf];
    const rect = e.target.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (spec.w / rect.width);
    const y = (e.clientY - rect.top) * (spec.h / rect.height);
    const dx = x - dragStartRef.current.x;
    const dy = y - dragStartRef.current.y;

    setTransforms((prev) => {
      const cur = prev[id];
      const rawT = {
        scale: cur.scale,
        offsetX: dragStartRef.current.offsetX + dx,
        offsetY: dragStartRef.current.offsetY + dy,
      };
      const clamped = clampTransform(
        spec,
        img,
        rawT,
        cur.minScale,
        cur.maxScale
      );
      const nextState = {
        ...prev,
        [id]: { ...cur, ...clamped },
      };

      if (id === 'icon' && isLinked && images.B) {
        const dmgSpec = TARGET_SPECS.iconDamage;
        const dmgImg = images.B;
        const dmgCur = prev.iconDamage;
        const clampedDmg = clampTransform(
          dmgSpec,
          dmgImg,
          { ...clamped },
          dmgCur.minScale,
          dmgCur.maxScale
        );
        nextState.iconDamage = { ...dmgCur, ...clampedDmg };
      }
      return nextState;
    });
  };

  /**
   * ポインターアップ（ドラッグ終了）
   */
  const handlePointerUp = () => {
    dragStartRef.current = null;
  };

  /**
   * マウスホイールでのズーム操作
   */
  const handleWheel = (id, e) => {
    const spec = TARGET_SPECS[id];
    if (!images[spec.sourceOf]) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (spec.w / rect.width);
    const py = (e.clientY - rect.top) * (spec.h / rect.height);
    const cur = transforms[id];
    const newScale = cur.scale * Math.pow(1.0015, -e.deltaY);
    setScaleAround(id, px, py, newScale);
  };

  /**
   * Pica Lanczosリサンプラーによる画像書き出し用サイズ変換
   */
  const resizeSourceToSize = async (img, targetW, targetH) => {
    const out = document.createElement('canvas');
    out.width = targetW;
    out.height = targetH;
    await picaInstance.resize(img, out, {
      quality: picaOptions.quality,
      filter: picaOptions.filter,
      unsharpAmount: picaOptions.unsharpAmount,
      unsharpRadius: picaOptions.unsharpRadius,
      unsharpThreshold: picaOptions.unsharpThreshold,
    });
    return out;
  };

  /**
   * 単一レイヤーの書き出し実行
   *
   * @param {string} id レイヤーID
   */
  const exportLayer = async (id) => {
    const spec = TARGET_SPECS[id];
    const img = images[spec.sourceOf];
    if (!img) {
      alert(`${id}: 画像が未アップロードのため書き出せません`);
      return;
    }

    const t = transforms[id];
    const targetW = Math.max(1, Math.round(img.naturalWidth * t.scale));
    const targetH = Math.max(1, Math.round(img.naturalHeight * t.scale));
    const resized = await resizeSourceToSize(img, targetW, targetH);

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = spec.w;
    exportCanvas.height = spec.h;
    const ctx = exportCanvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (spec.circular) {
      ctx.save();
      ctx.beginPath();
      const r = (spec.w * ICON_CIRCLE.diameterRatio) / 2;
      ctx.arc(
        spec.w * ICON_CIRCLE.centerXRatio,
        spec.h * ICON_CIRCLE.centerYRatio,
        r,
        0,
        Math.PI * 2
      );
      ctx.clip();
    }
    ctx.drawImage(resized, t.offsetX, t.offsetY);
    if (spec.circular) ctx.restore();

    const mime = format === 'png' ? 'image/png' : 'image/webp';
    const blob = await new Promise((resolve) =>
      exportCanvas.toBlob(resolve, mime, format === 'webp' ? 0.92 : undefined)
    );

    if (!blob) {
      alert(
        '書き出しに失敗しました。ブラウザがこの形式に対応していない可能性があります。'
      );
      return;
    }

    const slug = nameSlug.trim() || 'output';
    const filenameMap = {
      char: `char_${slug}.${format}`,
      board: `board_${slug}.${format}`,
      icon: `icon_${slug}.${format}`,
      iconDamage: `icon_${slug}_damage.${format}`,
    };

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filenameMap[id];
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  /**
   * 全4ファイルの一括書き出し実行
   */
  const exportAll = async () => {
    for (const id of ['char', 'board', 'icon', 'iconDamage']) {
      await exportLayer(id);
      await new Promise((r) => setTimeout(r, 150));
    }
  };

  return (
    <div className="chara-assetmaker-container">
      <h1>キャラアセット書き出しツール</h1>

      {/* 画像アップロードおよび基本設定バー */}
      <div className="upload-bar">
        <div className="field">
          <label>通常表情画像（Image A）</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleUpload('A', e.target.files[0])}
          />
        </div>
        <div className="field">
          <label>ダメージ表情画像（Image B）</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleUpload('B', e.target.files[0])}
          />
          <span className="hint">アイコンのダメージ差分にのみ使用されます</span>
        </div>
        <div className="field">
          <label>出力名（◯◯◯部分）</label>
          <input
            type="text"
            value={nameSlug}
            onChange={(e) => setNameSlug(e.target.value)}
            placeholder="例: dragon"
          />
        </div>
        <div className="field">
          <label>書き出し形式</label>
          <div className="format-options">
            <label>
              <input
                type="radio"
                name="format"
                value="webp"
                checked={format === 'webp'}
                onChange={(e) => setFormat(e.target.value)}
              />
              WebP
            </label>
            <label>
              <input
                type="radio"
                name="format"
                value="png"
                checked={format === 'png'}
                onChange={(e) => setFormat(e.target.value)}
              />
              PNG
            </label>
          </div>
        </div>
      </div>

      {/* Pica リサイズ設定パネル */}
      <details className="settings-panel">
        <summary>書き出しリサイズ設定（pica）</summary>
        <div className="settings-grid">
          <div className="field">
            <label>quality（0〜3・大きいほど高品質）</label>
            <select
              value={picaOptions.quality}
              onChange={(e) =>
                handlePicaOptionChange('quality', parseFloat(e.target.value))
              }
            >
              <option value="0">0（最速・粗い）</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3（最高品質）</option>
            </select>
          </div>
          <div className="field">
            <label>filter（補間カーネル）</label>
            <select
              value={picaOptions.filter}
              onChange={(e) => handlePicaOptionChange('filter', e.target.value)}
            >
              <option value="box">box</option>
              <option value="hamming">hamming</option>
              <option value="lanczos2">lanczos2</option>
              <option value="lanczos3">lanczos3</option>
              <option value="mks2013">mks2013</option>
            </select>
          </div>
          <div className="field">
            <label>unsharpAmount（0〜500）</label>
            <input
              type="number"
              min="0"
              max="500"
              step="1"
              value={picaOptions.unsharpAmount}
              onChange={(e) =>
                handlePicaOptionChange(
                  'unsharpAmount',
                  parseFloat(e.target.value) || 0
                )
              }
            />
          </div>
          <div className="field">
            <label>unsharpRadius（0.5〜2.0）</label>
            <input
              type="number"
              min="0.5"
              max="2"
              step="0.1"
              value={picaOptions.unsharpRadius}
              onChange={(e) =>
                handlePicaOptionChange(
                  'unsharpRadius',
                  parseFloat(e.target.value) || 0.5
                )
              }
            />
          </div>
          <div className="field">
            <label>unsharpThreshold（0〜255）</label>
            <input
              type="number"
              min="0"
              max="255"
              step="1"
              value={picaOptions.unsharpThreshold}
              onChange={(e) =>
                handlePicaOptionChange(
                  'unsharpThreshold',
                  parseFloat(e.target.value) || 0
                )
              }
            />
          </div>
          <div className="field">
            <label>&nbsp;</label>
            <button type="button" onClick={handleResetPicaOptions}>
              初期値に戻す
            </button>
          </div>
        </div>
        <p className="hint">
          unsharpAmountを上げるとシャープになりますが、上げすぎるとなめらかなグラデーション部分に段差(バンディング)が出ることがあります。unsharpThresholdを2〜5程度にすると軽減できます。設定はブラウザに保存され、次回も引き継がれます。
        </p>
      </details>

      {/* メインレイヤーグリッド */}
      <main className="grid">
        {Object.keys(TARGET_SPECS).map((id) => {
          const spec = TARGET_SPECS[id];
          const slug = nameSlug.trim() || 'output';
          const titleLabel = `${spec.label}${slug}${spec.suffix || ''}.${format}`;
          const t = transforms[id];

          return (
            <section key={id} className="panel">
              <h2>
                {titleLabel} <small>{spec.specText}</small>
              </h2>
              <div className="canvas-wrap">
                <canvas
                  ref={canvasRefs[id]}
                  width={spec.w}
                  height={spec.h}
                  onPointerDown={(e) => handlePointerDown(id, e)}
                  onPointerMove={(e) => handlePointerMove(id, e)}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onWheel={(e) => handleWheel(id, e)}
                />
              </div>
              <div className="controls">
                <input
                  type="range"
                  className="zoom-slider"
                  min="0"
                  max="1"
                  step="0.001"
                  value={t ? t.sliderValue : 0}
                  onChange={(e) =>
                    handleSliderChange(id, parseFloat(e.target.value))
                  }
                />
                <button
                  type="button"
                  className="reset-btn"
                  onClick={() => resetLayerTransform(id)}
                >
                  リセット
                </button>
                <button
                  type="button"
                  className="download-btn"
                  onClick={() => exportLayer(id)}
                >
                  ダウンロード
                </button>
              </div>
              {id === 'iconDamage' && (
                <div className="link-row">
                  <label>
                    <input
                      type="checkbox"
                      checked={isLinked}
                      onChange={(e) => setIsLinked(e.target.checked)}
                    />
                    通常アイコンの位置・サイズにリンク
                  </label>
                </div>
              )}
            </section>
          );
        })}
      </main>

      {/* 全ファイルダウンロードフッター */}
      <footer>
        <button type="button" onClick={exportAll}>
          4ファイルをまとめてダウンロード
        </button>
      </footer>
    </div>
  );
}
