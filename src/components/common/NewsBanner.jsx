import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { switchScreen, playSound } from '../../utils/gameUtils.js';
import { SOUNDS } from '../../utils/sounds.js';

export default function NewsBanner() {
  const [newsItems, setNewsItems] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedNews, setSelectedNews] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('api/get_news.php')
      .then(res => res.text())
      .then(text => {
        try {
          const data = JSON.parse(text);
          if (data.success && data.news && data.news.length > 0) {
            const now = new Date();
            
            // ユーザー表示用にisActiveがtrueかつ公開期間内のものだけフィルタ
            const activeNews = data.news.filter(n => {
              if (!n.isActive) return false;
              
              if (n.startDate) {
                const start = new Date(n.startDate);
                if (now < start) return false;
              }
              if (n.endDate) {
                const end = new Date(n.endDate);
                if (now > end) return false;
              }
              
              return true;
            });
            
            setNewsItems(activeNews);
          }
        } catch (e) {
          // ローカルのViteサーバー環境などでPHPが実行されずパースエラーになった場合のフォールバック
          setNewsItems([
            { 
              id: 1, 
              title: 'ローカルテスト表示：お知らせ機能', 
              content: '<p>これはローカル環境用の一時的な表示です。</p><br><p>ここから長い文章が続きます。</p><p>テスト用のテキスト1</p><p>テスト用のテキスト2</p><p>テスト用のテキスト3</p><p>テスト用のテキスト4</p><p>テスト用のテキスト5</p><p>スクロールの確認のためのテキストです。</p><p>まだまだ続きます。</p><p>このお知らせ詳細ウィンドウは、本文が長い場合にスクロールできるようになっている必要があります。</p><br><p>【一番下のテキスト】ご確認ありがとうございます。</p>', 
              color1: '#3b82f6', 
              color2: '#1d4ed8', 
              icon: '✨', 
              isActive: true,
              date: '2026/06/12'
            }
          ]);
        }
      })
      .catch(err => {
        console.error('Failed to fetch news:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const displayItems = isLoading 
    ? [{ id: 'loading', title: 'お知らせを確認中...', icon: '⏳', color1: '#1e293b', color2: '#0f172a', isPlaceholder: true }]
    : newsItems.length === 0 
      ? [{ id: 'empty', title: '新しいお知らせはありません', icon: '💤', color1: '#1e293b', color2: '#0f172a', isPlaceholder: true }]
      : newsItems;

  useEffect(() => {
    if (displayItems.length <= 1) return;
    const timer = setInterval(() => {
      // モーダルが開いている間は自動スライドを停止
      if (!selectedNews) {
        setCurrentIndex((prev) => (prev + 1) % displayItems.length);
      }
    }, 4000); // 4秒ごとにスライド

    return () => clearInterval(timer);
  }, [displayItems.length, selectedNews]);

  const handleBannerClick = (item) => {
    if (item.isPlaceholder) return;
    console.log("handleBannerClick fired!", item);
    try {
      playSound?.(SOUNDS?.seClick);
    } catch(e) {}
    setSelectedNews(item);
  };

  const handleShortcut = (shortcut) => {
    playSound?.(SOUNDS?.seClick);
    setSelectedNews(null);
    switchScreen(shortcut);
  };

  return (
    <>
      <div className="news-banner-container">
        <div 
          className="news-banner-track"
          style={{ transform: `translateX(-${currentIndex * 100}%)` }}
        >
          {displayItems.map((item) => (
            <div 
              key={item.id} 
              className="news-banner-slide"
              onClick={() => handleBannerClick(item)}
              style={
                item.imageUrl 
                  ? { backgroundImage: `url(${item.imageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', cursor: item.isPlaceholder ? 'default' : 'pointer' }
                  : { background: `linear-gradient(135deg, ${item.color1 || '#333'}, ${item.color2 || '#111'})`, cursor: item.isPlaceholder ? 'default' : 'pointer' }
              }
            >
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '30px 15px 10px 15px',
                background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.8))',
                display: 'flex',
                alignItems: 'center',
                pointerEvents: 'none'
              }}>
                <span className="news-banner-icon">{item.icon}</span>
                <span className="news-banner-text" style={{ textShadow: '1px 1px 3px black', color: item.isPlaceholder ? '#94a3b8' : '#fff' }}>{item.title}</span>
              </div>
            </div>
          ))}
        </div>
        
        {displayItems.length > 1 && (
          <div className="news-banner-indicators">
            {displayItems.map((_, index) => (
              <div 
                key={index}
                className={`news-banner-dot ${index === currentIndex ? 'active' : ''}`}
                onClick={() => {
                  playSound?.(SOUNDS?.seClick);
                  setCurrentIndex(index);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* お知らせ詳細ポップアップ */}
      {selectedNews && (
        <div 
          onClick={() => setSelectedNews(null)} 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            backgroundColor: 'rgba(0, 0, 0, 0.85)', 
            zIndex: 999999, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center' 
          }}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ padding: '20px', overflow: 'hidden', maxWidth: '400px', width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', background: '#1e293b', border: '2px solid #334155', borderRadius: '12px' }}>
            
            {/* 上部画像 (設定されている場合のみ、枠の内側に表示) */}
            {selectedNews.imageUrl && (
              <img src={selectedNews.imageUrl} alt="News Banner" style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', marginBottom: '15px', flexShrink: 0 }} />
            )}

            {/* タイトルと日付 (フレックスの縮小を防ぐ) */}
            <div style={{ textAlign: 'left', flexShrink: 0 }}>
              <h3 style={{ margin: '0 0 5px 0', fontSize: '1.2rem', color: '#f8fafc' }}>{selectedNews.title}</h3>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '15px' }}>{selectedNews.date}</div>
            </div>

            {/* カスタムスクロールバーのスタイル定義 */}
            <style>{`
              .news-content-html::-webkit-scrollbar {
                width: 8px;
              }
              .news-content-html::-webkit-scrollbar-track {
                background: #0f172a; 
                border-radius: 4px;
              }
              .news-content-html::-webkit-scrollbar-thumb {
                background: #475569; 
                border-radius: 4px;
              }
              .news-content-html::-webkit-scrollbar-thumb:hover {
                background: #64748b; 
              }
            `}</style>

            {/* 本文エリア (スクロール可能) */}
            <div 
              className="news-content-html"
              style={{ 
                fontSize: '0.95rem', 
                lineHeight: '1.6', 
                whiteSpace: 'pre-wrap', 
                color: '#e2e8f0', 
                textAlign: 'left', 
                overflowY: 'auto', 
                flexGrow: 1, 
                padding: '15px', 
                backgroundColor: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '8px'
              }}
              dangerouslySetInnerHTML={{ __html: selectedNews.content }}
            />
            
            {/* フッターボタン */}
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '10px', flexShrink: 0 }}>
              {selectedNews.shortcut && (
                <button className="btn btn-primary" onClick={() => handleShortcut(selectedNews.shortcut)}>
                  該当ページへ移動
                </button>
              )}
              <button className="btn" style={{ backgroundColor: '#475569' }} onClick={() => setSelectedNews(null)}>
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
