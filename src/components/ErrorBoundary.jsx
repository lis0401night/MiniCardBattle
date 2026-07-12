import { Component } from 'react';
import { reportError } from '../utils/errorReporter.js';
import { switchScreen } from '../utils/gameUtils.js';
import { appendVersionQuery } from '../utils/constants/config.js';

/**
 * ErrorBoundary
 *
 * Reactのレンダリング中に発生した例外をキャッチし、白画面を防止する。
 * エラー発生時はエラーログをサーバーに送信し、リカバリUIを表示する。
 *
 * React公式のError BoundaryはクラスコンポーネントのcomponentDidCatchでのみ実装可能。
 * @see https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // レンダリングエラー発生時にフォールバックUIを表示するための状態更新
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // エラーログをサーバーに送信
    const stack = [
      error?.stack || '',
      '--- Component Stack ---',
      errorInfo?.componentStack || '',
    ].join('\n');

    reportError(
      'react_boundary',
      error?.message || 'Unknown render error',
      stack
    );
  }

  /**
   * タイトル画面に安全に復帰する。
   * GameStateをリセットし、ErrorBoundaryの状態もクリアする。
   */
  handleReturnToTitle = () => {
    try {
      // ゲーム状態のリセット（バトル中フラグ等のクリア）
      if (window.GameState) {
        window.GameState.isProcessing = false;
        window.GameState.isInBattle = false;
        window.GameState.isBattleEnded = true;
      }
      // タイトル画面へ遷移
      switchScreen('screen-title');
    } catch {
      // switchScreenすら動かない場合はページリロード
      window.location.reload();
      return;
    }
    // ErrorBoundaryの状態をクリアして再レンダリングを許可
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || '不明なエラー';

      return (
        <div style={styles.container}>
          <div style={styles.card}>
            {/* アイコン */}
            <div style={styles.iconWrapper}>
              <img
                src={appendVersionQuery('assets/icons/icon_exclamation.webp')}
                alt="エラー"
                style={styles.icon}
                onError={(e) => {
                  e.target.style.display = 'none';
                }}
              />
            </div>

            {/* タイトル */}
            <h1 style={styles.title}>エラーが発生しました</h1>

            {/* メッセージ */}
            <p style={styles.message}>
              ゲームの実行中に問題が発生しました。
              <br />
              エラー情報は自動的にサーバーに送信されました。
            </p>

            {/* エラー詳細（折りたたみ） */}
            <details style={styles.details}>
              <summary style={styles.summary}>エラー詳細</summary>
              <pre style={styles.errorText}>{errorMessage}</pre>
            </details>

            {/* 復帰ボタン */}
            <button
              onClick={this.handleReturnToTitle}
              style={styles.button}
              onMouseEnter={(e) => {
                e.target.style.background =
                  'linear-gradient(135deg, #f59e0b, #d97706)';
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 20px rgba(245, 158, 11, 0.4)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background =
                  'linear-gradient(135deg, #eab308, #ca8a04)';
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = '0 4px 15px rgba(234, 179, 8, 0.3)';
              }}
            >
              タイトルに戻る
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- インラインスタイル（CSS依存を避けてErrorBoundary自体が壊れるリスクを最小化） ---
const styles = {
  container: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
    fontFamily:
      "'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  card: {
    background: 'rgba(30, 41, 59, 0.95)',
    border: '1px solid rgba(250, 204, 21, 0.2)',
    borderRadius: '16px',
    padding: '40px 32px',
    maxWidth: '420px',
    width: '90%',
    textAlign: 'center',
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
  },
  iconWrapper: {
    marginBottom: '16px',
  },
  icon: {
    width: '48px',
    height: '48px',
    opacity: 0.8,
  },
  title: {
    color: '#facc15',
    fontSize: '1.3rem',
    fontWeight: 'bold',
    margin: '0 0 12px 0',
    letterSpacing: '1px',
  },
  message: {
    color: '#94a3b8',
    fontSize: '0.9rem',
    lineHeight: '1.6',
    margin: '0 0 20px 0',
  },
  details: {
    marginBottom: '24px',
    textAlign: 'left',
  },
  summary: {
    color: '#64748b',
    fontSize: '0.8rem',
    cursor: 'pointer',
    userSelect: 'none',
    marginBottom: '8px',
  },
  errorText: {
    color: '#ef4444',
    fontSize: '0.75rem',
    background: 'rgba(0, 0, 0, 0.3)',
    borderRadius: '8px',
    padding: '12px',
    overflow: 'auto',
    maxHeight: '120px',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-all',
    margin: 0,
  },
  button: {
    background: 'linear-gradient(135deg, #eab308, #ca8a04)',
    color: '#0f172a',
    border: 'none',
    borderRadius: '12px',
    padding: '14px 36px',
    fontSize: '1rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    letterSpacing: '1px',
    transition: 'all 0.2s ease',
    boxShadow: '0 4px 15px rgba(234, 179, 8, 0.3)',
  },
};
