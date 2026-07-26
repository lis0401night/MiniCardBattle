import { useMemo, useState } from 'react';
import {
  GRID_DENSITY_COLS,
  GRID_DENSITY_GAPS,
  MAX_CARD_COPIES,
} from '../utils/constants/config.js';

const RARITY_ORDER = {
  SSR: 4,
  SR: 3,
  R: 2,
  N: 1,
};

/**
 * カードフィルター・ソート・グリッド密度管理カスタムフック
 */
export function useCardFilterSort({
  masterCards = [],
  inventory = {},
  densityStorageKey = 'mini_card_battle_grid_density_cardlist',
  defaultOwnership = 'include_unowned',
}) {
  // グリッド密度 (localStorage連携)
  const [gridDensity, setGridDensity] = useState(() => {
    const saved = localStorage.getItem(densityStorageKey);
    return saved === 'compact' || saved === 'dense' ? saved : 'normal';
  });

  const cycleGridDensity = () => {
    setGridDensity((prev) => {
      let next = 'normal';
      if (prev === 'normal') next = 'compact';
      else if (prev === 'compact') next = 'dense';
      else next = 'normal';
      localStorage.setItem(densityStorageKey, next);
      return next;
    });
  };

  // モーダル表示状態
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [sortModalVisible, setSortModalVisible] = useState(false);

  // 確定済みフィルター状態
  const [filters, setFilters] = useState({
    name: '',
    ownership: defaultOwnership,
    rarity: [],
    cost: [],
    skills: [],
  });

  // モーダル内の一時フィルター状態
  const [tempFilters, setTempFilters] = useState({
    name: '',
    ownership: defaultOwnership,
    rarity: [],
    cost: [],
    skills: [],
  });

  // 確定済みソート状態
  const [sortKey, setSortKey] = useState('default');
  const [sortOrder, setSortOrder] = useState('asc');

  // モーダル内の一時ソート状態
  const [tempSortKey, setTempSortKey] = useState('default');
  const [tempSortOrder, setTempSortOrder] = useState('asc');

  // モーダルオープン時の初期化
  const openFilterModal = () => {
    setTempFilters({ ...filters });
    setFilterModalVisible(true);
  };

  const openSortModal = () => {
    setTempSortKey(sortKey);
    setTempSortOrder(sortOrder);
    setSortModalVisible(true);
  };

  const toggleTempFilter = (type, value) => {
    setTempFilters((prev) => {
      const list = prev[type] || [];
      const exists = list.includes(value);
      return {
        ...prev,
        [type]: exists ? list.filter((v) => v !== value) : [...list, value],
      };
    });
  };

  const toggleTempSkillFilter = (skillId) => {
    toggleTempFilter('skills', skillId);
  };

  const applyFilters = () => {
    setFilters({ ...tempFilters });
    setFilterModalVisible(false);
  };

  const resetFilters = () => {
    const initial = {
      name: '',
      ownership: defaultOwnership,
      rarity: [],
      cost: [],
      skills: [],
    };
    setTempFilters(initial);
    setFilters(initial);
    setFilterModalVisible(false);
  };

  const applySort = () => {
    setSortKey(tempSortKey);
    setSortOrder(tempSortOrder);
    setSortModalVisible(false);
  };

  const resetSort = () => {
    setTempSortKey('default');
    setTempSortOrder('asc');
    setSortKey('default');
    setSortOrder('asc');
    setSortModalVisible(false);
  };

  // フィルタリング処理
  const filteredMasterCards = useMemo(() => {
    return masterCards.filter((c) => {
      const ownership = filters.ownership || defaultOwnership;
      const ownedCount = inventory[c.id] || 0;

      if (ownership === 'owned_only' && ownedCount <= 0) return false;
      if (ownership === 'three_or_less' && ownedCount > MAX_CARD_COPIES - 1)
        return false;

      if (
        filters.name &&
        !c.name.toLowerCase().includes(filters.name.toLowerCase())
      ) {
        return false;
      }

      if (filters.rarity.length > 0 && !filters.rarity.includes(c.rarity)) {
        return false;
      }

      if (filters.cost.length > 0) {
        const matchesCost = filters.cost.some((costVal) => {
          if (costVal === '5+') return c.cost >= 5;
          return c.cost === costVal;
        });
        if (!matchesCost) return false;
      }

      if (filters.skills.length > 0) {
        const matchesSkill = filters.skills.some((skillId) => {
          if (c.onPlaySkill === skillId) return true;
          if (
            Array.isArray(c.turnSkills) &&
            c.turnSkills.some((ts) => ts.skill === skillId)
          ) {
            return true;
          }
          if (
            Array.isArray(c.passiveSkills) &&
            c.passiveSkills.some((ps) => ps.skill === skillId)
          ) {
            return true;
          }
          return false;
        });
        if (!matchesSkill) return false;
      }

      return true;
    });
  }, [masterCards, inventory, filters, defaultOwnership]);

  // ソート処理
  const sortedMasterCards = useMemo(() => {
    const list = [...filteredMasterCards];
    if (sortKey === 'default') return list;

    list.sort((a, b) => {
      let valA, valB;
      if (sortKey === 'cost') {
        valA = a.cost ?? 0;
        valB = b.cost ?? 0;
      } else if (sortKey === 'attack') {
        valA = a.attack ?? 0;
        valB = b.attack ?? 0;
      } else if (sortKey === 'hp') {
        valA = a.hp ?? 0;
        valB = b.hp ?? 0;
      } else if (sortKey === 'rarity') {
        valA = RARITY_ORDER[a.rarity] || 0;
        valB = RARITY_ORDER[b.rarity] || 0;
      } else if (sortKey === 'name') {
        const comp = (a.name || '').localeCompare(b.name || '', 'ja');
        return sortOrder === 'asc' ? comp : -comp;
      } else {
        const idxA = masterCards.findIndex((mc) => mc.id === a.id);
        const idxB = masterCards.findIndex((mc) => mc.id === b.id);
        valA = idxA !== -1 ? idxA : Number.MAX_SAFE_INTEGER;
        valB = idxB !== -1 ? idxB : Number.MAX_SAFE_INTEGER;
      }

      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;

      // 同点の場合のフォールバック (デフォルト順)
      const idxA = masterCards.findIndex((mc) => mc.id === a.id);
      const idxB = masterCards.findIndex((mc) => mc.id === b.id);
      return (
        (idxA !== -1 ? idxA : Number.MAX_SAFE_INTEGER) -
        (idxB !== -1 ? idxB : Number.MAX_SAFE_INTEGER)
      );
    });

    return list;
  }, [filteredMasterCards, sortKey, sortOrder, masterCards]);

  return {
    gridDensity,
    cycleGridDensity,
    gridCols: GRID_DENSITY_COLS[gridDensity],
    gridGap: GRID_DENSITY_GAPS[gridDensity],
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
    sortKey,
    sortOrder,
    tempSortKey,
    setTempSortKey,
    tempSortOrder,
    setTempSortOrder,
    applySort,
    resetSort,
    sortedMasterCards,
  };
}
