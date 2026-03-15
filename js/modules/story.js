// ==========================================
// ストーリーモード進行管理 (story.js)
// ==========================================

function initStoryMode(charId) {
    playerConfig = CHARACTERS[charId];

    // 他のキャラクターのIDをランダムに並び替え（プレイヤーとサタンは除く）
    const otherIds = Object.keys(CHARACTERS).filter(id => id !== charId && id !== 'satan');
    for (let i = otherIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [otherIds[i], otherIds[j]] = [otherIds[j], otherIds[i]];
    }

    // ストーリー構成: 1-3戦目(ランダム), 4戦目(自分/影), 5-6戦目(残りランダム), 7戦目(サタン)
    storyQueue = [otherIds[0], otherIds[1], otherIds[2], 'shadow', otherIds[3], otherIds[4], 'satan'];

    battleCount = 1;
    appState = 'story_intro';

    dialogueQueue = [
        { speaker: 'narrator', text: playerConfig.narratorIntro }
    ];
    playerConfig.storyIntro.forEach(text => {
        dialogueQueue.push({ speaker: 'player', text: text });
    });

    performFadeTransition(() => {
        setupDialogueScreen();
    });
}

/**
 * ストーリーモードの進行管理
 */
function handleStoryProgression() {
    if (appState === 'pre_dialogue') {
        startBattleFlow();
    } else if (appState === 'post_dialogue') {
        if (lastBattleResult === 'lose') {
            showContinueScreen();
        } else {
            // 戦闘に勝利した場合、中間のストーリーがあるか判定
            const isSatanBattle = enemyConfig.id === 'satan' && !enemyConfig.isShadow;
            if (playerConfig.interBattleStory && !isSatanBattle) {
                appState = 'inter_battle_story';
                dialogueQueue = [];

                let storyLines = null;
                const stories = playerConfig.interBattleStory;

                if (stories[battleCount]) {
                    storyLines = stories[battleCount];
                } else if (stories.default && stories.default.length > 0) {
                    const randomIndex = Math.floor(Math.random() * stories.default.length);
                    storyLines = stories.default[randomIndex];
                }

                if (storyLines) {
                    storyLines.forEach(text => {
                        dialogueQueue.push({ speaker: 'player', text: text });
                    });
                    performFadeTransition(() => {
                        setupDialogueScreen();
                    });
                } else {
                    // ストーリーが無ければ即座にカウントアップして次へ
                    battleCount++;
                    performFadeTransition(() => {
                        startNextBattleSequence();
                    });
                }
            } else {
                // 通常勝利またはサタン戦後のストーリー用
                battleCount++;
                performFadeTransition(() => {
                    startNextBattleSequence();
                });
            }
        }
    } else if (appState === 'story_intro') {
        performFadeTransition(() => {
            startNextBattleSequence();
        });
    } else if (appState === 'inter_battle_story') {
        battleCount++;
        performFadeTransition(() => {
            startNextBattleSequence();
        });
    } else if (appState === 'ending_dialogue') {
        appState = 'ending_illust';
        switchScreen('screen-ending-illust');
        const img = document.getElementById('ending-illust-img');
        const txt = document.getElementById('ending-text');
        img.src = playerConfig.imageEnding;
        setTimeout(() => {
            img.style.opacity = 1;
            txt.style.opacity = 1;
        }, 100);
    }
}
