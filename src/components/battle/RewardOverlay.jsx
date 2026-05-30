import { useState, useEffect, useRef } from 'react';
import { GameState } from '../../state/gameState.js';
import { CARD_MASTER } from '../../utils/constants/cards.js';
import { SOUNDS } from '../../utils/sounds.js';
import { playSound } from '../../utils/gameUtils.js';
import { saveDeck } from '../../services/deck.js';
import { setupDialogueScreen } from '../../services/uiDialogue.js';

import CardPreviewContent from '../common/CardPreviewContent.jsx';

export default function RewardOverlay() {
  const [isVisible, setIsVisible] = useState(false);
  const [card, setCard] = useState(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const grantedRef = useRef(false);

  useEffect(() => {
    window.showCardRewardReact = (rewardCardId) => {
      const rewardCardTemplate = CARD_MASTER.find((m) => m.id === rewardCardId);
      if (rewardCardTemplate) {
        setCard({ ...rewardCardTemplate, owner: 'blue' });
        grantedRef.current = false; // 表示されるたびにリセット
        setIsRevealed(false);
        setIsVisible(true);
      }
    };

    window.closeRewardScreenReact = () => {
      setIsVisible(false);
    };

    return () => {
      delete window.showCardRewardReact;
      delete window.closeRewardScreenReact;
    };
  }, []);

  if (!isVisible || !card) return null;

  const handleReveal = () => {
    if (grantedRef.current) return;
    grantedRef.current = true;
    playSound(SOUNDS.seClick);
    setIsRevealed(true);
    if (GameState.gameMode !== 'campaign') {
      GameState.playerInventory[card.id] =
        (GameState.playerInventory[card.id] || 0) + 1;
      saveDeck();
    }
  };

  const handleNext = (e) => {
    e.stopPropagation();
    playSound(SOUNDS.seClick);
    setIsVisible(false);

    // 報酬確認が終わったらダイアログ（会話）シーンへ移行する
    setupDialogueScreen();
  };

  const renderSkillTagReact = (c) => {
    if (!window.renderSkillTag) return null;
    return (
      <div
        dangerouslySetInnerHTML={{ __html: window.renderSkillTag(c, false) }}
      ></div>
    );
  };

  return (
    <div
      className="screen active"
      style={{
        zIndex: 2000,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex',
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <CardPreviewContent
        card={card}
        isRevealed={isRevealed}
        onRevealAreaClick={handleReveal}
        renderSkillTagReact={renderSkillTagReact}
        customActionSlot={
          isRevealed && (
            <button
              className="btn"
              style={{
                marginTop: '15px',
                width: '100%',
                flexShrink: 0,
                background: 'linear-gradient(45deg, #22c55e, #16a34a)',
              }}
              onClick={handleNext}
            >
              次へ
            </button>
          )
        }
      />
    </div>
  );
}
