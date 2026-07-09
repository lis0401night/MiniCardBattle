import { GAME_VERSION } from '../../utils/constants/config.js';

export default function CreditModal({ visible, onClose }) {
  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 5000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '24px',
          width: '100%',
          maxWidth: '360px',
          boxShadow:
            '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          maxHeight: '80dvh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            color: '#facc15',
            fontSize: '1.25rem',
            margin: 0,
            textAlign: 'center',
            fontWeight: 'bold',
            borderBottom: '2px solid rgba(250, 204, 21, 0.2)',
            paddingBottom: '10px',
          }}
        >
          クレジット
        </h3>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            color: '#cbd5e1',
            fontSize: '0.85rem',
            lineHeight: '1.5',
          }}
        >
          <div style={{ textAlign: 'center', marginBottom: '8px' }}>
            <div
              style={{
                fontSize: '1.1rem',
                fontWeight: 'bold',
                color: '#ffffff',
                letterSpacing: '1px',
              }}
            >
              MiniCardBattle
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
              ver{GAME_VERSION}
            </div>
          </div>

          <div>
            <div
              style={{
                fontWeight: 'bold',
                color: '#facc15',
                fontSize: '0.9rem',
                marginBottom: '4px',
              }}
            >
              【音楽・効果音】
            </div>
            <div
              style={{
                paddingLeft: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div>・Adobe Firefly</div>
              <div>・Dan Bosley @daniconshow</div>
              <div>
                ・A.I. Sound Stock
                <br />
                <span
                  style={{
                    fontSize: '0.75rem',
                    paddingLeft: '10px',
                    display: 'inline-block',
                  }}
                >
                  <a
                    href="https://ai-sound-stock.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#60a5fa',
                      textDecoration: 'underline',
                    }}
                  >
                    https://ai-sound-stock.com/
                  </a>
                </span>
              </div>
              <div>
                ・Pixabay
                <br />
                <span
                  style={{
                    fontSize: '0.75rem',
                    paddingLeft: '10px',
                    display: 'inline-block',
                  }}
                >
                  <a
                    href="https://pixabay.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#60a5fa',
                      textDecoration: 'underline',
                    }}
                  >
                    https://pixabay.com
                  </a>
                </span>
              </div>
            </div>
          </div>

          <div>
            <div
              style={{
                fontWeight: 'bold',
                color: '#facc15',
                fontSize: '0.9rem',
                marginBottom: '4px',
              }}
            >
              【グラフィック】
            </div>
            <div
              style={{
                paddingLeft: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
            >
              <div>・Google AI Pro</div>
              <div>・ChatGPT</div>
              <div>
                ・ぴぽや
                <br />
                <span
                  style={{
                    fontSize: '0.75rem',
                    paddingLeft: '10px',
                    display: 'inline-block',
                  }}
                >
                  <a
                    href="https://pipoya.net/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#60a5fa',
                      textDecoration: 'underline',
                    }}
                  >
                    https://pipoya.net/
                  </a>
                </span>
              </div>
              <div>
                ・藤宮翔流のひきだし
                <br />
                <span
                  style={{
                    fontSize: '0.75rem',
                    paddingLeft: '10px',
                    display: 'inline-block',
                  }}
                >
                  <a
                    href="http://game-hikidashi.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: '#60a5fa',
                      textDecoration: 'underline',
                    }}
                  >
                    http://game-hikidashi.com/
                  </a>
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              textAlign: 'center',
              fontSize: '0.75rem',
              color: '#64748b',
              marginTop: '10px',
              borderTop: '1px solid #334155',
              paddingTop: '10px',
            }}
          >
            © 2026 MiniCardBattle All Rights Reserved.
          </div>
        </div>

        <button
          className="btn"
          style={{
            background: 'linear-gradient(45deg, #3b82f6, #1d4ed8)',
            width: '100%',
            marginTop: '10px',
            fontSize: '0.95rem',
            padding: '10px 0',
            borderRadius: '8px',
            fontWeight: 'bold',
          }}
          onClick={onClose}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
