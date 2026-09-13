/**
 * パック画像表示コンポーネント
 * assets/ui/packimg01.png をベースに、指定されたカード（エレメンタル・マスター等）の画像を
 * パック形状マスクおよび乗算（multiply）ブレンドで合成し、スペキュラ光沢とテキストロゴを重ねた
 * 立体感のあるカードパック画像を生成・描画します。
 */

import { appendVersionQuery } from '../../utils/constants/config.js';
import {
  DEFAULT_PACK_COVER_CARD_ID,
  resolvePackLogoUrl,
} from '../../utils/constants/packs.js';

/**
 * パックカバー画像描画コンポーネント。
 *
 * @param {Object} props
 * @param {string} [props.coverCardId=DEFAULT_PACK_COVER_CARD_ID] - パック表紙として合成するカードのID
 * @param {string} [props.coverImgUrl] - 表紙カード画像のURL（省略時はcoverCardIdから自動解決）
 * @param {string} [props.logoUrl] - パック表面に重ねるタイトルロゴ画像のURL（省略時は既定ロゴ画像を自動解決）
 * @param {Object} [props.style] - 外枠コンテナに追加適用するCSSスタイルオブジェクト
 * @param {string} [props.className=''] - 外枠コンテナに追加適用するCSSクラス名
 * @returns {JSX.Element} パック画像要素
 */
export default function PackCoverImage({
  coverCardId = DEFAULT_PACK_COVER_CARD_ID,
  coverImgUrl,
  logoUrl,
  style = {},
  className = '',
}) {
  // 表紙カード画像URL（指定がなければカードアセットから解決）
  const resolvedCoverUrl =
    coverImgUrl || appendVersionQuery(`assets/cards/card_${coverCardId}.webp`);
  const packBgUrl = appendVersionQuery('assets/ui/packimg01.png');
  const packTextUrl = appendVersionQuery('assets/ui/packtextimg01.png');
  const resolvedLogoUrl = resolvePackLogoUrl(logoUrl);

  return (
    <div
      className={`pack-cover-wrapper ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        ...style,
      }}
    >
      {/* 1. パック下地ベース画像 */}
      <img
        src={packBgUrl}
        alt="pack base"
        loading="lazy"
        decoding="async"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />

      {/* 2. 表紙カード画像（パック形状にマスクしてmultiply合成） */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 2,
          WebkitMaskImage: `url(${packBgUrl})`,
          WebkitMaskSize: 'contain',
          WebkitMaskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskImage: `url(${packBgUrl})`,
          maskSize: 'contain',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img
          src={resolvedCoverUrl}
          alt="pack cover"
          loading="lazy"
          decoding="async"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            mixBlendMode: 'multiply',
            filter: 'contrast(1.08) saturate(1.15) brightness(0.98)',
          }}
        />
      </div>

      {/* 3. スペキュラ（光沢オーバーレイ） */}
      <img
        src={packBgUrl}
        alt="pack specular"
        loading="lazy"
        decoding="async"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          mixBlendMode: 'overlay',
          opacity: 0.55,
          zIndex: 3,
        }}
      />

      {/* 4. パック前面テキストロゴ */}
      <img
        src={packTextUrl}
        alt="pack text"
        loading="lazy"
        decoding="async"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          zIndex: 4,
        }}
      />

      {/* 5. パックタイトルロゴ（最前面） */}
      {resolvedLogoUrl && (
        <img
          src={resolvedLogoUrl}
          alt="pack logo"
          loading="lazy"
          decoding="async"
          style={{
            position: 'absolute',
            top: '40%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '86%',
            maxHeight: '40%',
            objectFit: 'contain',
            zIndex: 5,
            filter: 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.6))',
          }}
        />
      )}
    </div>
  );
}
