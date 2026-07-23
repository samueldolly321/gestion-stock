import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DEFAULT_PAGE_SIZE = 20;

/** Hook de pagination : découpe une liste et gère la page courante. */
export function usePagination<T>(items: T[], pageSize: number = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // Si la liste rétrécit (filtre/recherche) et que la page dépasse, on revient à 1.
  useEffect(() => {
    if (page > pageCount) setPage(1);
  }, [pageCount, page]);

  const start = (page - 1) * pageSize;
  const paged = items.slice(start, start + pageSize);

  return {
    paged,
    page,
    setPage,
    pageCount,
    total: items.length,
    from: items.length ? start + 1 : 0,
    to: Math.min(start + pageSize, items.length),
    pageSize,
  };
}

interface PaginationProps {
  page: number;
  pageCount: number;
  total: number;
  from: number;
  to: number;
  onChange: (page: number) => void;
}

/** Barre de pagination (masquée s'il y a une seule page). */
export default function Pagination({ page, pageCount, total, from, to, onChange }: PaginationProps) {
  if (pageCount <= 1) return null;

  const btn =
    'p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 ' +
    'hover:bg-slate-100 dark:hover:bg-slate-800/60 disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer';

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 dark:border-slate-800/60 text-xs">
      <span className="text-slate-500">
        Affichage <strong className="text-slate-700 dark:text-slate-300 font-mono">{from}–{to}</strong> sur{' '}
        <strong className="text-slate-700 dark:text-slate-300 font-mono">{total}</strong>
      </span>
      <div className="flex items-center gap-2">
        <button onClick={() => onChange(page - 1)} disabled={page <= 1} className={btn} title="Page précédente">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums">
          Page {page} / {pageCount}
        </span>
        <button onClick={() => onChange(page + 1)} disabled={page >= pageCount} className={btn} title="Page suivante">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
