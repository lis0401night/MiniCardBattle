import React, { useEffect, useState } from 'react';

import { showNextDialogue } from '../hooks/uiDialogue.js';

export default function DialogueScreen() {
    const [dialogueData, setDialogueData] = useState(() => window.currentDialogueData || {});

    useEffect(() => {
        // マウント時に最新データを確実に取得
        setDialogueData({ ...window.currentDialogueData });

        // uiDialogue.jsからReactの状態を更新するための内部関数を定義
        window._reactUpdateDialogueUI = (newData) => {
            setDialogueData(prev => ({ ...prev, ...newData }));
        };

        return () => {
            window._reactUpdateDialogueUI = null;
        };
    }, []);

    const handleBoxClick = () => {
        if (showNextDialogue) {
            showNextDialogue();
        }
    };

    const d = dialogueData;

    return (
        <div id="screen-dialogue" className="screen active">
            {/* 暗転レイヤー */}
            <div 
                style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'black',
                    opacity: d.isFading ? 1 : 0,
                    transition: 'opacity 0.4s ease',
                    zIndex: 9999,
                    pointerEvents: 'none'
                }} 
            />
            <div className={`portrait-container ${d.centerMode ? 'center' : ''}`}>
                <img 
                    id="portrait-left" 
                    className={`char-portrait ${d.leftActive ? 'active' : ''}`} 
                    src={d.leftImage || ''} 
                    alt="Player" 
                    style={{ visibility: d.leftImage ? 'visible' : 'hidden' }}
                />
                <img 
                    id="portrait-right" 
                    className={`char-portrait ${d.rightActive ? 'active' : ''}`} 
                    src={d.rightImage || ''} 
                    alt="Enemy" 
                    style={{ 
                        filter: d.rightFilter || 'none', 
                        display: d.rightDisplay || 'block',
                        visibility: d.rightImage ? 'visible' : 'hidden'
                    }}
                />
            </div>
            <div 
                className="dialogue-box" 
                onClick={handleBoxClick}
                style={{ borderColor: d.boxBorderColor || '#475569' }}
            >
                <div id="speaker-name" style={{ color: d.nameColor || '#fff' }}>{d.speakerName || ''}</div>
                <div id="dialogue-text">{d.dialogueText || ''}</div>
            </div>
        </div>
    );
}
