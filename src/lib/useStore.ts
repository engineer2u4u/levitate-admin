"use client";

import { useCallback, useSyncExternalStore } from "react";
import { CATALOG_IDLE, EMPTY, read, readCatalogStatus, subscribe } from "./store";

/**
 * Live view of the admin data. Reads come straight from the store rather than
 * being mirrored into state, so any write re-renders every screen showing it.
 * The store returns a stable reference between writes, which this relies on.
 */
export function useAdminData() {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => read(), []),
    // The server has no storage; rendering empty keeps hydration consistent.
    useCallback(() => EMPTY, []),
  );
}

/**
 * Whether courses and sessions have arrived from the database. A screen that
 * lists them shows this instead of an empty list, which would otherwise read
 * as "there are none".
 */
export function useCatalogStatus() {
  return useSyncExternalStore(subscribe, readCatalogStatus, () => CATALOG_IDLE);
}
