import { useEffect, useRef } from 'react';

import MenuButton from '../common/MenuButton.jsx';
import { playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

// モーダル描画完了後にフォーカスを移すまでの待機時間(ms)
const FOCUS_DELAY_MS = 50;

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
  const modalRef = useRef(null);
  // モーダルを開く直前にフォーカスしていた要素を保持する
  const previousFocusRef = useRef(null);

  /**
   * モーダル表示時に最初のフォーカス可能要素へフォーカスを割り当てるエフェクト
   * また、フォーカス位置に関わらず Escape キーで即座にモーダルを閉じられるようグローバルリスナーを登録します。
   * モーダルを閉じる際は、開く直前の要素へフォーカスを戻します。
   */
  useEffect(() => {
    if (!isOpen) return;

    previousFocusRef.current = document.activeElement;

    const timer = setTimeout(() => {
      if (modalRef.current) {
        const firstFocusable = modalRef.current.querySelector(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          modalRef.current.focus();
        }
      }
    }, FOCUS_DELAY_MS);

    // モーダル外フォーカス時やタイマー待機中にも Escape キーで確実に閉じられるようグローバルリスナーを追加
    const handleGlobalKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        playSound?.(SOUNDS?.seClick);
        if (onCancel) onCancel();
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleGlobalKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [isOpen, onCancel]);

  /**
   * モーダル内でのキーボード操作（Tab によるフォーカストラップ）ハンドラ
   * @param {React.KeyboardEvent} e - キーボードイベント
   * @returns {void}
   */
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      // グローバルイベントで処理されるため、重複発動を防止
      return;
    }

    if (e.key === 'Tab' && modalRef.current) {
      const focusables = Array.from(
        modalRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      );

      if (focusables.length === 0) return;

      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];

      if (e.shiftKey) {
        // Shift + Tab: 先頭要素で押された場合は末尾要素へフォーカス移動
        if (document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        }
      } else {
        // Tab: 末尾要素で押された場合は先頭要素へフォーカス移動
        if (document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    }
  };

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
      onKeyDown={handleKeyDown}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="room-type-select-title"
        tabIndex={-1}
        style={{
          background: 'linear-gradient(135deg, #1e293b, #0f172a)',
          border: '2px solid #38bdf8',
          borderRadius: '16px',
          padding: '24px 28px',
          width: '90%',
          maxWidth: '360px',
          textAlign: 'center',
          boxShadow: '0 0 25px rgba(56, 189, 248, 0.3)',
          outline: 'none',
        }}
      >
        <h3
          id="room-type-select-title"
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
          <MenuButton
            label="キャンセル"
            variant="gray"
            style={{ width: '100%', maxWidth: '260px', margin: 0 }}
            onClick={onCancel}
          />
        </div>
      </div>
    </div>
  );
}
