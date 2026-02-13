import { useState, useCallback } from 'react';
import { getInvestigatingFlag, clearInvestigatingFlag } from '@/lib/errors';
import type { ChangelogDay } from '@/types/activity';

export interface ChangelogState {
  days: ChangelogDay[];
  loading: boolean;
  error: string | null;
  investigating: boolean;
}

export function useChangelog() {
  const [state, setState] = useState<ChangelogState>({
    days: [],
    loading: false,
    error: null,
    investigating: false,
  });

  const fetchChangelog = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch('/system-changelog.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const days: ChangelogDay[] = await response.json();

      // Developer clear: if any entry has clearInvestigating, clear the flag
      const shouldClear = days.some((day) => day.clearInvestigating === true);
      if (shouldClear) {
        clearInvestigatingFlag();
      }

      // Check investigating flag
      const flag = getInvestigatingFlag();
      const investigating = !shouldClear && flag !== null && flag.investigating === true;

      setState({
        days,
        loading: false,
        error: null,
        investigating,
      });
    } catch {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: 'Could not load changelog.',
      }));
    }
  }, []);

  const dismissInvestigating = useCallback(() => {
    clearInvestigatingFlag();
    setState((prev) => ({ ...prev, investigating: false }));
  }, []);

  const checkInvestigating = useCallback(() => {
    const flag = getInvestigatingFlag();
    const investigating = flag !== null && flag.investigating === true;
    setState((prev) => ({ ...prev, investigating }));
  }, []);

  return { ...state, fetchChangelog, dismissInvestigating, checkInvestigating };
}
