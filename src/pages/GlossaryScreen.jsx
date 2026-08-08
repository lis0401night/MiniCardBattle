import { useState, useRef, useCallback, useEffect } from 'react';

import ScreenLayout from '../components/common/ScreenLayout.jsx';
import { GLOSSARY_DATA } from '../utils/constants/glossary.js';
import { showGalleryMenu } from '../services/uiGallery.js';

/** アコーディオン展開アニメーションの持続時間(ms) */
const ACCORDION_DURATION_MS = 300;

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
 * 各カテゴリ領域内で中項目リストをスムーズなアニメーション付きで開閉制御する。
 * @returns {import('react').ReactElement} 用語集画面
 */
export default function GlossaryScreen() {
  // 開いている大項目のインデックスセット
  const [openCategories, setOpenCategories] = useState(new Set());
  // 開いている中項目のキーセット（"カテゴリIndex-用語Index" 形式）
  const [openTerms, setOpenTerms] = useState(new Set());

  /**
   * 大項目のアコーディオン開閉をトグルする
   * 他の大項目および展開中の中項目を閉じた上で、選択された大項目のみを展開する排他制御を行う。
   * @param {number} categoryIndex - 大項目のインデックス
   * @returns {void}
   */
  const toggleCategory = useCallback(
    (categoryIndex) => {
      const isOpen = openCategories.has(categoryIndex);
      if (isOpen) {
        setOpenCategories(new Set());
        setOpenTerms(new Set());
      } else {
        setOpenCategories(new Set([categoryIndex]));
        setOpenTerms(new Set());
      }
    },
    [openCategories]
  );

  /**
   * 中項目のアコーディオン開閉をトグルする
   * 他の中項目を閉じた上で、選択された中項目のみを展開する排他制御を行う。
   * @param {string} termKey - 中項目の一意キー（"カテゴリIndex-用語Index"）
   * @returns {void}
   */
  const toggleTerm = useCallback(
    (termKey) => {
      const isOpen = openTerms.has(termKey);
      if (isOpen) {
        setOpenTerms(new Set());
      } else {
        setOpenTerms(new Set([termKey]));
      }
    },
    [openTerms]
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
                      <div key={termKey} className="glossary-term">
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
