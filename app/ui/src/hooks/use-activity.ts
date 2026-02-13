import { useState, useCallback } from 'react';
import { apiRequest } from '@/lib/api';
import type { ActivityEntry, ActivityResponse } from '@/types/activity';

export interface ActivityState {
  entries: ActivityEntry[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  nextCursor: string | null;
}

export function useActivity() {
  const [state, setState] = useState<ActivityState>({
    entries: [],
    loading: false,
    loadingMore: false,
    error: null,
    nextCursor: null,
  });

  const fetchActivity = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await apiRequest<ActivityResponse>('/api/audit-log?limit=20');
      setState({
        entries: data.entries,
        loading: false,
        loadingMore: false,
        error: null,
        nextCursor: data.nextCursor,
      });
    } catch {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: 'Could not load recent activity. Try again in a moment.',
      }));
    }
  }, []);

  const fetchMore = useCallback(async () => {
    if (!state.nextCursor || state.loadingMore) return;
    setState((prev) => ({ ...prev, loadingMore: true }));
    try {
      const data = await apiRequest<ActivityResponse>(
        `/api/audit-log?limit=20&cursor=${encodeURIComponent(state.nextCursor!)}`
      );
      setState((prev) => ({
        ...prev,
        entries: [...prev.entries, ...data.entries],
        loadingMore: false,
        nextCursor: data.nextCursor,
      }));
    } catch {
      setState((prev) => ({
        ...prev,
        loadingMore: false,
        error: 'Could not load more entries.',
      }));
    }
  }, [state.nextCursor, state.loadingMore]);

  return { ...state, fetchActivity, fetchMore };
}
