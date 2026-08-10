import { useState, useRef, useCallback, useEffect } from 'react';

import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { GLOSSARY_DATA } from '../utils/constants/glossary.js';
import { showGalleryMenu } from '../services/uiGallery.js';

/** アコーディオン展開アニメーションの持続時間(ms) */
const ACCORDION_DURATION_MS = 300;

/** アコーディオン開閉後のスクロール開始までの遅延時間(ms) */
const SCROLL_DELAY_MS = 50;

/**
 * アコーディオンで滑らかに開閉するパネルコンポーネント
 * max-height トランジションを用いてコンテンツの高さに合わせた展開/収縮を行う。
 * @param {object} props
 * @param {boolean} props.isOpen - パネルが開いているかどうか
 * @param {React.ReactNode} props.children - パネル内のコンテンツ
 * @returns {import('react').ReactElement} アニメーション付きパネル
 */
function AccordionPanel({ isOpen, children }) {
  const contentRef = useRef(null);
  const [maxHeight, setMaxHeight] = useState(0);

  useEffect(() => {
    if (isOpen && contentRef.current) {
      setMaxHeight(contentRef.current.scrollHeight);
    } else {
      setMaxHeight(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !contentRef.current) return;
    const observer = new ResizeObserver(() => {
      if (contentRef.current) {
        setMaxHeight(contentRef.current.scrollHeight);
      }
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  return (
    <div
      className="glossary-accordion-panel"
      aria-hidden={!isOpen}
      style={{
        maxHeight: isOpen ? `${maxHeight}px` : '0px',
        overflow: 'hidden',
        transition: `max-height ${ACCORDION_DURATION_MS}ms ease`,
      }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
}

/**
 * 用語集画面コンポーネント
 * 大項目（カテゴリ）→ 中項目（用語）の2段アコーディオンで用語集を表示する。
 * 各カテゴリ領域内で中項目リストをスムーズなアニメーション付きで開閉制御し、選択項目への自動スクロールを行う。
 * @returns {import('react').ReactElement} 用語集画面
 */
export default function GlossaryScreen() {
  // 開いている大項目のインデックスセット
  const [openCategories, setOpenCategories] = useState(new Set());
  // 開いている中項目のキーセット（"カテゴリIndex-用語Index" 形式）
  const [openTerms, setOpenTerms] = useState(new Set());
  // 各カテゴリ・用語ヘッダーへの参照マップ
  const headerRefs = useRef({});
  // スクロール用タイマー参照
  const scrollTimerRef = useRef(null);

  /**
   * 保留中の自動スクロールタイマーを安全にキャンセルする
   * @returns {void}
   */
  const cancelPendingScroll = useCallback(() => {
    if (scrollTimerRef.current) {
      clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = null;
    }
  }, []);

  /**
   * 指定された要素をビューポート内に滑らかにスクロールする
   * アコーディオンの展開アニメーション完了後に実行する。
   * @param {string} refKey - headerRefs に格納されたキー
   * @param {ScrollLogicalPosition} [blockPosition='start'] - スクロール位置（'start'|'center'|'nearest'）
   * @returns {void}
   */
  const scrollIntoViewSmooth = useCallback(
    (refKey, blockPosition = 'start') => {
      cancelPendingScroll();
      scrollTimerRef.current = setTimeout(() => {
        const el = headerRefs.current[refKey];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: blockPosition });
        }
        scrollTimerRef.current = null;
      }, ACCORDION_DURATION_MS + SCROLL_DELAY_MS);
    },
    [cancelPendingScroll]
  );

  useEffect(() => {
    return () => {
      cancelPendingScroll();
    };
  }, [cancelPendingScroll]);

  /**
   * 大項目のアコーディオン開閉をトグルする
   * 他の大項目および展開中の中項目を閉じた上で、選択された大項目のみを展開しスクロールする。
   * 閉じる操作時は進行中の自動スクロールタイマーを即座にキャンセルする。
   * @param {number} categoryIndex - 大項目のインデックス
   * @returns {void}
   */
  const toggleCategory = useCallback(
    (categoryIndex) => {
      setOpenCategories((prev) => {
        const isOpening = !prev.has(categoryIndex);
        if (isOpening) {
          scrollIntoViewSmooth(`cat-${categoryIndex}`);
        } else {
          cancelPendingScroll();
        }
        return isOpening ? new Set([categoryIndex]) : new Set();
      });
      setOpenTerms(new Set());
    },
    [scrollIntoViewSmooth, cancelPendingScroll]
  );

  /**
   * 中項目のアコーディオン開閉をトグルする
   * 他の中項目を閉じた上で、選択された中項目のみを展開し滑らかに自動スクロールする。
   * 閉じる操作時は進行中の自動スクロールタイマーを即座にキャンセルする。
   * @param {string} termKey - 中項目の一意キー（"カテゴリIndex-用語Index"）
   * @returns {void}
   */
  const toggleTerm = useCallback(
    (termKey) => {
      setOpenTerms((prev) => {
        const isOpening = !prev.has(termKey);
        if (isOpening) {
          scrollIntoViewSmooth(`term-${termKey}`);
        } else {
          cancelPendingScroll();
        }
        return isOpening ? new Set([termKey]) : new Set();
      });
    },
    [scrollIntoViewSmooth, cancelPendingScroll]
  );

  return (
    <ScreenLayout
      id="screen-glossary"
      title="用語集"
      titleColor="#facc15"
      backgroundImage="background_gallery.webp"
      onBackClick={() => showGalleryMenu?.()}
      backHasBorder={true}
    >
      <div className="glossary-container">
        {GLOSSARY_DATA.map((category, catIdx) => {
          const isCatOpen = openCategories.has(catIdx);
          return (
            <div key={catIdx} className="glossary-category">
              {/* 大項目ヘッダー */}
              <button
                ref={(el) => {
                  headerRefs.current[`cat-${catIdx}`] = el;
                }}
                className={`glossary-category-header ${isCatOpen ? 'glossary-category-header-active' : ''}`}
                onClick={() => toggleCategory(catIdx)}
                aria-expanded={isCatOpen}
              >
                <span className="glossary-category-title">
                  {category.category}
                </span>
                <span
                  className={`glossary-arrow ${isCatOpen ? 'glossary-arrow-open' : ''}`}
                >
                  ▶
                </span>
              </button>

              {/* 中項目リスト（アニメーション付き） */}
              <AccordionPanel isOpen={isCatOpen}>
                <div className="glossary-terms" aria-hidden={!isCatOpen}>
                  {category.terms.map((term, termIdx) => {
                    const termKey = `${catIdx}-${termIdx}`;
                    const isTermOpen = openTerms.has(termKey);
                    return (
                      <div
                        key={termKey}
                        ref={(el) => {
                          headerRefs.current[`term-${termKey}`] = el;
                        }}
                        className="glossary-term"
                      >
                        {/* 中項目ヘッダー */}
                        <button
                          className={`glossary-term-header ${isTermOpen ? 'glossary-term-header-active' : ''}`}
                          onClick={() => toggleTerm(termKey)}
                          aria-expanded={isTermOpen}
                          tabIndex={isCatOpen ? 0 : -1}
                        >
                          <span className="glossary-term-title">
                            {term.term}
                          </span>
                          <span
                            className={`glossary-arrow glossary-arrow-sm ${isTermOpen ? 'glossary-arrow-open' : ''}`}
                          >
                            ▶
                          </span>
                        </button>

                        {/* 説明文（アニメーション付き） */}
                        <AccordionPanel isOpen={isTermOpen}>
                          <div className="glossary-description">
                            {term.description}
                          </div>
                        </AccordionPanel>
                      </div>
                    );
                  })}
                </div>
              </AccordionPanel>
            </div>
          );
        })}
      </div>
    </ScreenLayout>
  );
}
