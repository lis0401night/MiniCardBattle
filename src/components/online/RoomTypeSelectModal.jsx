import MenuButton from '../common/MenuButton.jsx';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

/**
 * オンライン対戦 ルーム公開/非公開選択モーダルコンポーネント
 *
 * @param {object} props - コンポーネントのプロパティ
 * @param {boolean} props.isOpen - モーダルの表示フラグ
 * @param {function(): void} props.onSelectPublic - 「公開ルーム作成」選択時のハンドラ
 * @param {function(): void} props.onSelectPrivate - 「非公開ルーム作成」選択時のハンドラ
 * @param {function(): void} props.onCancel - 「キャンセル」選択時のハンドラ
 * @returns {import('react').ReactElement|null} モーダル要素またはnull
 */
export default function RoomTypeSelectModal({
  isOpen,
  onSelectPublic,
  onSelectPrivate,
  onCancel,
}) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          border: '2px solid #38bdf8',
          borderRadius: '16px',
          padding: '24px 28px',
          width: '90%',
          maxWidth: '360px',
          textAlign: 'center',
          boxShadow: '0 0 25px rgba(56, 189, 248, 0.3)',
        }}
      >
        <h3
          style={{
            color: '#38bdf8',
            margin: '0 0 12px 0',
            fontSize: '1.25rem',
          }}
        >
          ルーム公開設定
        </h3>
        <p
          style={{
            color: '#94a3b8',
            fontSize: '0.9rem',
            marginBottom: '20px',
            lineHeight: 1.5,
          }}
        >
          作成するルームの公開種別を選択してください。
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            width: '100%',
            alignItems: 'center',
          }}
        >
          <MenuButton
            label="公開ルーム作成"
            variant="blue"
            style={{ width: '100%', maxWidth: '260px', margin: 0 }}
            onClick={onSelectPublic}
          />
          <MenuButton
            label="非公開ルーム作成"
            variant="yellow"
            style={{ width: '100%', maxWidth: '260px', margin: 0 }}
            onClick={onSelectPrivate}
          />
          <button
            type="button"
            className="btn"
            style={{
              width: '100%',
              maxWidth: '260px',
              margin: 0,
              padding: '12px 20px',
              background: '#475569',
              color: '#e2e8f0',
              border: '1px solid #64748b',
              borderRadius: '10px',
              fontWeight: 900,
              fontSize: '1.1rem',
              letterSpacing: '1.5px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              cursor: 'pointer',
            }}
            onClick={() => {
              playSound?.(SOUNDS?.seClick);
              if (onCancel) onCancel();
            }}
          >
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
