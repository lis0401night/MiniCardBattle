# キャラクターアセット制作・リメイクワークフロー仕様書

本書は、ゲーム内のキャラクター立ち絵（通常・各種スキン）の画風リメイク、およびそれに紐づく「通常アイコン」「ダメージアイコン」「プレイマット」等の各種派生アセットを、**1ピクセルの位置ズレもなく、画風と画質を完璧に保ちながら制作・更新するための完全手順書**です。

---

## 1. アセット構成と規格仕様

各キャラクター（およびスキン）は以下の連動アセット群で構成されます。

| アセット種別 | 格納パス | 規格・解像度 | 特徴・マスク仕様 |
| :--- | :--- | :--- | :--- |
| **立ち絵** | `public/assets/characters/char_{charId}[_{skin}].webp` | 800 × 1200 (2:3) | アルファなし、WebP (品質90) |
| **立ち絵サムネ** | `public/assets/characters/char_{charId}[_{skin}]_thumb.webp` | アスペクト比維持 | `npm run build` 時に自動生成 |
| **通常アイコン** | `public/assets/icons/icon_{charId}[_{skin}].webp` | 200 × 200 (1:1) | 立ち絵から正方形トリミング。中心(100, 100), 半径96pxの円形アルファマスク |
| **ダメージアイコン** | `public/assets/icons/icon_{charId}[_{skin}]_damage.webp` | 200 × 200 (1:1) | 通常アイコンと頭部・背景の位置が完全一致。表情のみダメージ顔へインペイント合成 |
| **プレイマット** | `public/assets/boards/board_{charId}[_{skin}].webp` | 400 × 200 (2:1) | 立ち絵のバストアップ領域から横長トリミング。WebP (品質90) |
| **プレイマットサムネ** | `public/assets/boards/board_{charId}[_{skin}]_thumb.webp` | アスペクト比維持 | `npm run build` 時に自動生成 |
| **敗北立ち絵** | `public/assets/characters/char_{charId}[_{skin}]_lose.webp` | 800 × 1200 (2:3) | アルファなし、WebP (品質90) |

---

## 2. Phase 1: 立ち絵の画風リメイクと選定手順

### 2.1 画風統一の基本方針（トーン＆マナー）
- **他キャラの基準画風**: 日本のアニメ調／セル調（くっきりとした黒の主線・輪郭線、滑らかなアニメシェーディング、端正なアニメフェイス）。
- **避けるべき表現**: アメコミ調の粗いハッチング線、解剖学的に生々しすぎる筋肉の筋や過剰な陰影、リアル厚塗りの鼻筋や唇。
- **守るべき塗りのリッチさ**: ベタ塗り・単調なセル画調に落としすぎず、装飾や武器の炎・金属・宝石・水滴などの多層ハイライトや立体感は最高峰の密度を維持する。

### 2.2 【絶対厳守】画質の世代劣化（ジェネレーションロス）防止
- AI画像生成において、生成画像を次の生成の参照画像として何世代も重ねると（Image-to-Imageのループ）、JPEG圧縮ノイズやモスキートノイズ、解像感の低下（ボケ）が蓄積します。
- **必ず「最高画質のオリジナル元データ」および「確定済みの最高画質公式アセット」を直接リファレンスにして1発で高品質生成すること。**

### 2.3 ユーザー承認フローの徹底
- 立ち絵の画風や表情、体格（腹筋の割れ具合など）はキャラクター設定に関わる最重要事項です。
- **ユーザーが画風を正式に承認するまで、決してファイルの更新や後続の派生アセット（アイコン・プレイマット等）の作成に進んではならない。**

---

## 3. Phase 2: トリミング座標の厳密特定（位置ズレ防止）

### 3.1 「位置ズレ絶対禁止」の原則
プレイマットやアイコンは、**元の立ち絵と同じ画像をトリミングして作成**されています。立ち絵を差し替える際、目分量でトリミングすると対戦画面や選択画面でアイコンやプレイマットの位置が大きくガタついてしまいます。

### 3.2 数学的特定手法（差分二乗和探索: SSD）
既存の元画像同士を比較し、旧立ち絵のどこから旧プレイマットや旧アイコンが切り出されたかをピクセル単位で特定します。

```javascript
// scratch/find_exact_crops.js のアルゴリズム概要
import sharp from 'sharp';

// 1. 旧立ち絵と旧プレイマット/旧アイコンを読み込む
const charRaw = await sharp('scratch/old_char.webp').raw().toBuffer({ resolveWithObject: true });
const boardRaw = await sharp('scratch/old_board.webp').raw().toBuffer({ resolveWithObject: true });

// 2. 切り出し矩形 (left, top, width, height) をグリッド探索し、差分 (pixel_diff^2) が最小となる座標を特定
// イグニス通常スキンの実績値:
// プレイマット: { left: 47, top: 159, width: 728, height: 364 } -> resize(400, 200)
// アイコン:     { left: 292, top: 155, width: 257, height: 257 } -> resize(200, 200)
```

新立ち絵の解像度（800×1200）と構図が旧立ち絵と合致しているため、この**特定された座標値をそのまま新立ち絵に適用することで、1ピクセルも狂わない完全なトリミング**が実現できます。

---

## 4. Phase 3: 各種派生アセットの作成手順

### 4.1 立ち絵の配置
決定された高解像度画像を `sharp` でリサイズ・WebP化して配置します。
```javascript
await sharp(sourceJpg)
  .resize(800, 1200, { fit: 'cover' })
  .webp({ quality: 90 })
  .toFile('public/assets/characters/char_{charId}_{skin}.webp');
```

### 4.2 通常アイコンの生成（円形マスク）
特定されたトリミング座標から切り出し、200×200にリサイズ後、円形アルファマスク（半径96px、中心100,100）を適用します。
```javascript
const circleSvg = Buffer.from(
  '<svg width="200" height="200"><circle cx="100" cy="100" r="96" fill="white"/></svg>'
);
await sharp('public/assets/characters/char_{charId}_{skin}.webp')
  .extract({ left: cropLeft, top: cropTop, width: cropSize, height: cropSize })
  .resize(200, 200)
  .composite([{ input: circleSvg, blend: 'dest-in' }])
  .webp({ quality: 90 })
  .toFile('public/assets/icons/icon_{charId}_{skin}.webp');
```

### 4.3 ダメージアイコンの作成（シームレス・インペイント合成）
対戦中に通常アイコンとダメージアイコンが切り替わった際、頭部・ツノ・耳・髪・背景・衣装がガタつくと不自然になります。
そのため、**通常アイコンをベース（土台）として敷き、表情パーツ（目・眉・口・擦り傷）の領域のみを滑らかな楕円グラデーションでブレンド合成**します。

```javascript
// 生ピクセルバッファによる精密フェザーブレンド（scratch/build_perfect_damage_icon.js）
const width = 200, height = 200;
const normalRaw = await sharp('public/assets/icons/icon_{charId}_{skin}.webp').raw().toBuffer({ resolveWithObject: true });
const damageRaw = await sharp(damageGenJpg).resize(width, height).removeAlpha().raw().toBuffer({ resolveWithObject: true });

const outBuf = Buffer.alloc(width * height * 4);
const cx = 98, cy = 132, rx = 42, ry = 36; // 表情の中心座標と楕円半径

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const idx4 = (y * width + x) * 4;
    const idx3 = (y * width + x) * 3;

    // 円形マスク (半径96px)
    const dCircle = Math.sqrt((x - 100)**2 + (y - 100)**2);
    if (dCircle > 96.5) { outBuf[idx4 + 3] = 0; continue; }
    const circleAlpha = dCircle > 95.5 ? Math.round(255 * (96.5 - dCircle)) : 255;

    // 楕円フェザーブレンド率 t (1.0 = ダメージ表情, 0.0 = 通常アイコン)
    const dist = Math.sqrt(((x - cx)/rx)**2 + ((y - cy)/ry)**2);
    let t = dist <= 0.7 ? 1.0 : (dist < 1.0 ? 0.5 * (1 + Math.cos(Math.PI * (dist - 0.7) / 0.3)) : 0.0);

    outBuf[idx4]     = Math.round(damageRaw.data[idx3]     * t + normalRaw.data[idx4]     * (1 - t));
    outBuf[idx4 + 1] = Math.round(damageRaw.data[idx3 + 1] * t + normalRaw.data[idx4 + 1] * (1 - t));
    outBuf[idx4 + 2] = Math.round(damageRaw.data[idx3 + 2] * t + normalRaw.data[idx4 + 2] * (1 - t));
    outBuf[idx4 + 3] = circleAlpha;
  }
}
await sharp(outBuf, { raw: { width, height, channels: 4 } })
  .webp({ quality: 90 })
  .toFile('public/assets/icons/icon_{charId}_{skin}_damage.webp');
```

### 4.4 プレイマットの生成
特定された横長トリミング座標から切り出し、400×200のWebPとして保存します。
```javascript
await sharp('public/assets/characters/char_{charId}_{skin}.webp')
  .extract({ left: boardCropLeft, top: boardCropTop, width: boardCropW, height: boardCropH })
  .resize(400, 200)
  .webp({ quality: 90 })
  .toFile('public/assets/boards/board_{charId}_{skin}.webp');
```

---

## 5. Phase 4: ビルドおよび品質検証

全アセット配置後、必ず以下のコマンドを実行してサムネイルの整合性とビルドを確認します。

```bash
# 1. サムネイルの自動生成および本番ビルド
npm run build
```
- 出力ログに `char_xxx_thumb.webp` や `board_xxx_thumb.webp` の「生成成功」が出力されていることを確認。

```bash
# 2. 静的解析（ESLint）チェック
npm run lint
```
- エラー・警告ゼロであることを確認。

```bash
# 3. Git ステータス確認
git status -s
```
- 対象のアセットファイルのみが正常に変更されていることを確認する。
