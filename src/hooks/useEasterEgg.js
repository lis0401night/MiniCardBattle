import { useRef, useEffect } from 'react';

/**
 * タイトル複数回クリックなどのイースターエッグ（デバッグモード等の起動）検知用カスタムフック
 * 状態管理（クリック数）とカウント加算処理を共通化し、DRY原則を保ちます。
 *
 * @param {function} onTrigger - 指定されたクリック数に達した際に実行するコールバック関数
 * @param {number} [targetCount=10] - トリガーに必要なクリック数（デフォルトは10回）
 * @returns {function} クリックイベントハンドラ
 */
const DEFAULT_EASTER_EGG_THRESHOLD = 10;

export function useEasterEgg(
  onTrigger,
  targetCount = DEFAULT_EASTER_EGG_THRESHOLD
) {
  const clickCountRef = useRef(0);
  const onTriggerRef = useRef(onTrigger);

  // クロージャの陳腐化を防ぐため、常に最新のonTriggerコールバック関数への参照を保持
  useEffect(() => {
    onTriggerRef.current = onTrigger;
  }, [onTrigger]);

  return () => {
    clickCountRef.current += 1;
    if (clickCountRef.current >= targetCount) {
      clickCountRef.current = 0;
      if (typeof onTriggerRef.current === 'function') {
        onTriggerRef.current();
      }
    }
  };
}
