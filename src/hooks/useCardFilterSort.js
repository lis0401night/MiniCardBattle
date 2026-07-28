import { useMemo, useState } from 'react';
import {
  GRID_DENSITY_COLS,
  GRID_DENSITY_GAPS,
  MAX_CARD_COPIES,
} from '../utils/constants/config.js';
import { isTransitioning, playSound } from '../utils/gameUtils.js';
import { SOUNDS } from '../utils/sounds.js';

/**
 * カードソートモード共有定数
 */
export const SORT_MODES = {
  RARITY_ASC: 'rarity_asc',
  RARITY_DESC: 'rarity_desc',
  POWER_ASC: 'power_asc',
  POWER_DESC: 'power_desc',
};

/**
 * カード所持フィルターモード共有定数
 */
export const OWNERSHIP_FILTERS = {
  OWNED_ONLY: 'owned_only',
  INCLUDE_UNOWNED: 'include_unowned',
  THREE_OR_LESS: 'three_or_less',
};

/**
 * デフォルトのカードソートモード
 */
export const DEFAULT_SORT_MODE = SORT_MODES.RARITY_ASC;

/**
 * カードフィルター・ソート・グリッド密度管理カスタムフック
 */
export function useCardFilterSort({
  masterCards = [],
  inventory = {},
  densityStorageKey = 'mini_card_battle_grid_density_cardlist',
  defaultOwnership = 'include_unowned',
}) {
  // グリッド密度 (0, 1, 2 のインデックス数値で管理)
  const [gridDensity, setGridDensity] = useState(() => {
    const saved = parseInt(localStorage.getItem(densityStorageKey), 10);
    return Number.isInteger(saved) &&
      saved >= 0 &&
      saved < GRID_DENSITY_COLS.length
      ? saved
      : 0;
  });

  const cycleGridDensity = () => {
    if (isTransitioning) return;
    playSound?.(SOUNDS?.seClick);
    const next = (gridDensity + 1) % GRID_DENSITY_COLS.length;
    localStorage.setItem(densityStorageKey, String(next));
    setGridDensity(next);
  };

  // モーダル表示状態
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);

  // ソートモード ('rarity_asc', 'rarity_desc', 'power_asc', 'power_desc')
  const [sortMode, setSortMode] = useState(DEFAULT_SORT_MODE);
  const [tempSortMode, setTempSortMode] = useState(DEFAULT_SORT_MODE);

  // 確定済みフィルター状態
  const [filters, setFilters] = useState({
    ownership: defaultOwnership,
    rarity: [],
    power: [],
    skills: [],
    excludeSkills: [],
    name: '',
  });

  // モーダル内の一時フィルター状態
  const [tempFilters, setTempFilters] = useState({
    ownership: defaultOwnership,
    rarity: [],
    power: [],
    skills: [],
    excludeSkills: [],
    name: '',
  });

  // モーダルオープン時の初期化
  const openFilterModal = () => {
    setTempFilters({ ...filters });
    setFilterModalVisible(true);
  };

  const openSortModal = () => {
    setTempSortMode(sortMode);
    setSortModalVisible(true);
  };

  const toggleTempFilter = (type, val) => {
    playSound?.(SOUNDS?.seClick);
    setTempFilters((prev) => {
      const arr = prev[type] || [];
      return {
        ...prev,
        [type]: arr.includes(val)
          ? arr.filter((x) => x !== val)
          : [...arr, val],
      };
    });
  };

  const toggleTempSkillFilter = (sk) => {
    playSound?.(SOUNDS?.seClick);
    setTempFilters((prev) => {
      const isIncluded = (prev.skills || []).includes(sk);
      const isExcluded = (prev.excludeSkills || []).includes(sk);

      let nextSkills = [...(prev.skills || [])];
      let nextExclude = [...(prev.excludeSkills || [])];

      if (!isIncluded && !isExcluded) {
        // 未選択 -> 指定（含む）
        nextSkills.push(sk);
      } else if (isIncluded) {
        // 指定 -> 除外
        nextSkills = nextSkills.filter((x) => x !== sk);
        nextExclude.push(sk);
      } else {
        // 除外 -> 未選択
        nextExclude = nextExclude.filter((x) => x !== sk);
      }

      return {
        ...prev,
        skills: nextSkills,
        excludeSkills: nextExclude,
      };
    });
  };

  const applyFilters = () => {
    playSound?.(SOUNDS?.seClick);
    setFilters({ ...tempFilters });
    setFilterModalVisible(false);
  };

  const resetFilters = () => {
    playSound?.(SOUNDS?.seClick);
    const initial = {
      ownership: defaultOwnership,
      rarity: [],
      power: [],
      skills: [],
      excludeSkills: [],
      name: '',
    };
    setTempFilters(initial);
    setFilters(initial);
  };

  const applySort = () => {
    playSound?.(SOUNDS?.seClick);
    setSortMode(tempSortMode);
    setSortModalVisible(false);
  };

  const resetSort = () => {
    playSound?.(SOUNDS?.seClick);
    setTempSortMode(DEFAULT_SORT_MODE);
    setSortMode(DEFAULT_SORT_MODE);
  };

  // フィルタリング処理
  const filteredMasterCards = useMemo(() => {
    return masterCards.filter((c) => {
      const ownership = filters.ownership || defaultOwnership;
      const ownedCount = inventory[c.id] || 0;

      if (ownership === OWNERSHIP_FILTERS.OWNED_ONLY && ownedCount <= 0)
        return false;
      if (
        ownership === OWNERSHIP_FILTERS.THREE_OR_LESS &&
        ownedCount > MAX_CARD_COPIES - 1
      )
        return false;

      if (
        filters.name &&
        !c.name.toLowerCase().includes(filters.name.toLowerCase())
      ) {
        return false;
      }

      if (filters.rarity?.length > 0 && !filters.rarity.includes(c.rarity)) {
        return false;
      }

      if (filters.power?.length > 0 && !filters.power.includes(c.power)) {
        return false;
      }

      let cardSkills = [];
      if (Array.isArray(c.skills))
        c.skills.forEach((sk) => cardSkills.push(sk.id));
      if (Array.isArray(c.choices))
        c.choices.forEach((ch) => cardSkills.push(ch.id));
      if (Array.isArray(c.choices2))
        c.choices2.forEach((ch) => cardSkills.push(ch.id));

      if (filters.skills && filters.skills.length > 0) {
        if (!filters.skills.some((sk) => cardSkills.includes(sk))) return false;
      }

      if (filters.excludeSkills && filters.excludeSkills.length > 0) {
        if (filters.excludeSkills.some((sk) => cardSkills.includes(sk)))
          return false;
      }

      return true;
    });
  }, [masterCards, inventory, filters, defaultOwnership]);

  // CARD_MASTERのID→定義順インデックス。ソートの安定化用
  const cardOrderMap = useMemo(() => {
    const map = new Map();
    (masterCards || []).forEach((c, i) => map.set(c.id, i));
    return map;
  }, [masterCards]);

  // ソート処理
  const sortedMasterCards = useMemo(() => {
    return [...filteredMasterCards].sort((a, b) => {
      const rarityA = a.rarity ?? 0;
      const rarityB = b.rarity ?? 0;
      const powerA = a.power ?? 0;
      const powerB = b.power ?? 0;

      if (sortMode === DEFAULT_SORT_MODE) {
        if (rarityA !== rarityB) return rarityA - rarityB;
      } else if (sortMode === SORT_MODES.RARITY_DESC) {
        if (rarityA !== rarityB) return rarityB - rarityA;
      } else if (sortMode === SORT_MODES.POWER_ASC) {
        if (powerA !== powerB) return powerA - powerB;
        if (rarityA !== rarityB) return rarityA - rarityB;
      } else if (sortMode === SORT_MODES.POWER_DESC) {
        if (powerA !== powerB) return powerB - powerA;
        if (rarityA !== rarityB) return rarityA - rarityB;
      }

      // 同レアリティ・同パワーの場合、元のカード定義順で一貫性を保つ
      const idxA = cardOrderMap.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const idxB = cardOrderMap.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      return idxA - idxB;
    });
  }, [filteredMasterCards, sortMode, cardOrderMap]);

  return {
    gridDensity,
    cycleGridDensity,
    gridCols: GRID_DENSITY_COLS[gridDensity] || GRID_DENSITY_COLS[0],
    gridGap: GRID_DENSITY_GAPS[gridDensity] ?? GRID_DENSITY_GAPS[0],
    filterModalVisible,
    setFilterModalVisible,
    openFilterModal,
    sortModalVisible,
    setSortModalVisible,
    openSortModal,
    filters,
    tempFilters,
    setTempFilters,
    toggleTempFilter,
    toggleTempSkillFilter,
    applyFilters,
    resetFilters,
    sortMode,
    isDefaultSort: sortMode === DEFAULT_SORT_MODE,
    tempSortMode,
    setTempSortMode,
    applySort,
    resetSort,
    sortedMasterCards,
  };
}
