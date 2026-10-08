"use client";

import { useState } from "react";

/**
 * Pages a list that is already filtered and sorted.
 *
 * The admin filters in the browser — the tables are hundreds of rows, not
 * millions — so paging is about what a screen can usefully show rather than
 * about what the database can send. A thousand enquiries in one scroll is a
 * list nobody reads to the end of.
 *
 * `resetKey` is whatever says "these are different rows now": the filters, the
 * search box. When it changes the page goes back to the first, because page 7
 * of a new search is a blank screen that looks like no results.
 */
export function usePaged<T>(items: T[], resetKey: string, perPage = 25) {
  const [page, setPage] = useState(1);
  const [seenKey, setSeenKey] = useState(resetKey);

  // Adjusting state during render rather than in an effect: React's own
  // recommendation for deriving state from props, and it avoids the flash of
  // the wrong page that an effect would leave.
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setPage(1);
  }

  const pages = Math.max(1, Math.ceil(items.length / perPage));
  // Deleting the last row of the last page must not strand the view on a page
  // that no longer exists.
  const current = Math.min(page, pages);
  const start = (current - 1) * perPage;
  const slice = items.slice(start, start + perPage);

  return {
    slice,
    page: current,
    pages,
    setPage,
    total: items.length,
    /** 1-based, for "Showing 26–50 of 180". */
    from: items.length === 0 ? 0 : start + 1,
    to: Math.min(start + perPage, items.length),
  };
}
