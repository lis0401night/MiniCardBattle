import { useState } from 'react';

/**
 * タイトル複数回クリックなどのイースターエッグ（デバッグモード等の起動）検知用カスタムフック
 * 状態管理（クリック数）とカウント加算処理を共通化し、DRY原則を保ちます。
 *
 * @param {function} onTrigger - 指定されたクリック数に達した際に実行するコールバック関数
 * @param {number} [targetCount=10] - トリガーに必要なクリック数（デフォルトは10回）
 * @returns {function} クリックイベントハンドラ
 */
export function useEasterEgg(onTrigger, targetCount = 10) {
  const [clickCount, setClickCount] = useState(0);

  return () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= targetCount) {
      setClickCount(0);
      onTrigger();
    }
  };
}
