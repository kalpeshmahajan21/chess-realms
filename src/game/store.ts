import { useSyncExternalStore, useRef } from 'react';

type Listener = () => void;

/** Minimal external store: React components subscribe with a selector; non-React code calls get/set. */
export interface Store<T> {
  get(): T;
  set(partial: Partial<T> | ((s: T) => Partial<T>)): void;
  subscribe(l: Listener): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => state,
    set(partial) {
      const patch = typeof partial === 'function' ? partial(state) : partial;
      let changed = false;
      for (const k in patch) {
        if (!Object.is((state as Record<string, unknown>)[k], (patch as Record<string, unknown>)[k])) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      state = { ...state, ...patch };
      listeners.forEach(l => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

/** Subscribe to a slice of a store. Re-renders only when the selected value changes (shallow for arrays/objects). */
export function useStore<T extends object, S>(store: Store<T>, selector: (s: T) => S): S {
  const cache = useRef<{ value: S } | null>(null);
  const getSnapshot = () => {
    const next = selector(store.get());
    if (cache.current && shallowEqual(cache.current.value, next)) return cache.current.value;
    cache.current = { value: next };
    return next;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}
