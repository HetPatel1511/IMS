import { useState } from 'react';

export type SortDir = 'asc' | 'desc';
export type Sort<K extends string> = { key: K; dir: SortDir } | null;

export function useClientSort<K extends string>(initial: Sort<K> = null) {
  const [sort, setSort] = useState<Sort<K>>(initial);
  const toggle = (key: K) =>
    setSort((prev) =>
      prev && prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
    );
  return { sort, toggle };
}

export function sortRows<T, K extends string>(
  rows: T[],
  sort: Sort<K>,
  accessor: (row: T, key: K) => unknown,
): T[] {
  if (!sort) return rows;
  const sign = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = accessor(a, sort.key);
    const bv = accessor(b, sort.key);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign;
    return String(av ?? '').localeCompare(String(bv ?? '')) * sign;
  });
}
