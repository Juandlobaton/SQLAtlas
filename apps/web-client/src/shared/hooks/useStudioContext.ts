import { useCallback } from 'react';
import { useStudioStore } from '@/shared/stores/studio.store';

/**
 * Drop-in replacement for useState that persists state in the Zustand store.
 * State survives module switches because it's stored globally, not in component state.
 *
 * Usage:
 *   const [search, setSearch] = useStudioContext('flow', 'search', '');
 *   // Behaves exactly like useState but persists when the component unmounts
 */
export function useStudioContext<T>(
  module: string,
  key: string,
  initialValue: T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const stored = useStudioStore((s) => s.moduleState[module]?.[key] as T | undefined);
  const setModuleState = useStudioStore((s) => s.setModuleState);

  const value: T = stored !== undefined ? stored : initialValue;

  const setValue = useCallback(
    (next: T | ((prev: T) => T)) => {
      if (typeof next === 'function') {
        const current = useStudioStore.getState().moduleState[module]?.[key] as T | undefined;
        const resolved = (next as (prev: T) => T)(current !== undefined ? current : initialValue);
        setModuleState(module, key, resolved);
      } else {
        setModuleState(module, key, next);
      }
    },
    [module, key, initialValue, setModuleState],
  );

  return [value, setValue];
}
