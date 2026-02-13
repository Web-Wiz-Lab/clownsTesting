import { useState, useCallback } from 'react';
import { apiRequest } from '@/lib/api';
import { explainApiError, reportErrorToOps, summarizeGroupedFailure } from '@/lib/errors';
import { getTimeFromDateTime } from '@/lib/time';
import type {
  TeamData,
  UnmatchedShift,
  ScheduleResponse,
  EditValues,
  BulkUpdateResponse,
} from '@/types/schedule';

export interface ScheduleState {
  date: Date | undefined;
  loading: boolean;
  mutating: boolean;
  teams: Record<string, TeamData>;
  unmatchedShifts: UnmatchedShift[];
  error: string | null;
  success: string | null;
  bulkEditMode: boolean;
  editingTeam: string | null;
  editedValues: Record<string, EditValues>;
  unmatchedEditing: number | null;
  modal: { message: string; type: 'loading' | 'success' | 'error' } | null;
}

export interface ScheduleActions {
  setDate: (date: Date | undefined) => void;
  searchSchedule: (selectedDate: Date) => Promise<void>;
  editTeam: (teamName: string) => void;
  cancelTeamEdit: (teamName: string) => void;
  updateTeam: (teamName: string, values: EditValues) => Promise<void>;
  enterBulkEditMode: () => void;
  cancelBulkEdit: () => void;
  updateAllTeams: (changedTeams: Array<{ teamName: string; values: EditValues }>) => Promise<void>;
  editUnmatched: (index: number) => void;
  cancelUnmatched: (index: number) => void;
  updateUnmatched: (index: number, values: EditValues) => Promise<void>;
  clearMessages: () => void;
  showError: (message: string) => void;
  showSuccess: (message: string, timeout?: number) => void;
}

export function useSchedule(): [ScheduleState, ScheduleActions] {
  const [state, setState] = useState<ScheduleState>({
    date: undefined,
    loading: false,
    mutating: false,
    teams: {},
    unmatchedShifts: [],
    error: null,
    success: null,
    bulkEditMode: false,
    editingTeam: null,
    editedValues: {},
    unmatchedEditing: null,
    modal: null,
  });

  const clearMessages = useCallback(() => {
    setState((prev) => ({ ...prev, error: null, success: null }));
  }, []);

  const showError = useCallback((message: string) => {
    setState((prev) => ({ ...prev, error: message, success: null }));
  }, []);

  const showSuccess = useCallback((message: string, timeout: number = 3000) => {
    setState((prev) => ({ ...prev, success: message, error: null }));
    if (timeout > 0) {
      setTimeout(() => {
        setState((prev) => ({ ...prev, success: null }));
      }, timeout);
    }
  }, []);

  const setDate = useCallback((date: Date | undefined) => {
    setState((prev) => ({ ...prev, date }));
  }, []);

  const normalizeScheduleToUi = useCallback((data: ScheduleResponse) => {
    const teams: Record<string, TeamData> = {};
    const unmatchedShifts: UnmatchedShift[] = [];

    (data.teams || []).forEach((team) => {
      teams[team.teamName] = {
        teamName: team.teamName,
        mainName: team.main.name,
        assistName: team.assist.name,
        mainShift: {
          id: team.main.shift.id,
          dtstart: team.main.shift.dtstart,
          dtend: team.main.shift.dtend,
          status: team.main.shift.status,
          user: { id: team.main.slingId },
        },
        assistShift: {
          id: team.assist.shift.id,
          dtstart: team.assist.shift.dtstart,
          dtend: team.assist.shift.dtend,
          status: team.assist.shift.status,
          user: { id: team.assist.slingId },
        },
      };
    });

    (data.unmatched || []).forEach((item) => {
      unmatchedShifts.push({
        id: item.shift.id,
        dtstart: item.shift.dtstart,
        dtend: item.shift.dtend,
        status: item.shift.status,
        user: { id: item.shift.userId || item.name },
        displayName: item.name,
      });
    });

    return { teams, unmatchedShifts };
  }, []);

  const searchSchedule = useCallback(
    async (selectedDate: Date) => {
      clearMessages();
      setState((prev) => ({
        ...prev,
        loading: true,
        bulkEditMode: false,
        editedValues: {},
        editingTeam: null,
        unmatchedEditing: null,
      }));

      try {
        const dateStr = selectedDate.toISOString().split('T')[0];
        const data = await apiRequest<ScheduleResponse>(
          `/api/schedule?date=${encodeURIComponent(dateStr)}`
        );
        const { teams, unmatchedShifts } = normalizeScheduleToUi(data);

        setState((prev) => ({
          ...prev,
          loading: false,
          teams,
          unmatchedShifts,
          date: selectedDate,
        }));
      } catch (error) {
        const userMessage = explainApiError(error, 'Could not load the schedule for this date.');
        showError(userMessage);
        setState((prev) => ({ ...prev, loading: false }));

        reportErrorToOps({
          action: 'load_schedule',
          userMessage,
          error,
          context: { selectedDate: selectedDate.toISOString() },
        }).then((report) => {
          if (report.triggered) {
            setState((prev) => ({
              ...prev,
              error: prev.error ? `${prev.error} Andrew was notified via Slack.` : null,
            }));
          }
        });
      }
    },
    [clearMessages, showError, normalizeScheduleToUi]
  );

  const editTeam = useCallback((teamName: string) => {
    setState((prev) => ({
      ...prev,
      editingTeam: teamName,
    }));
  }, []);

  const cancelTeamEdit = useCallback((teamName: string) => {
    setState((prev) => {
      const newEditedValues = { ...prev.editedValues };
      delete newEditedValues[teamName];
      return {
        ...prev,
        editingTeam: null,
        editedValues: newEditedValues,
      };
    });
  }, []);

  const updateTeam = useCallback(
    async (teamName: string, values: EditValues) => {
      const team = state.teams[teamName];
      if (!team) return;

      const originalStart = getTimeFromDateTime(team.mainShift.dtstart);
      const originalEnd = getTimeFromDateTime(team.mainShift.dtend);
      const originalStatus = team.mainShift.status;

      const timeChanged = values.start !== originalStart || values.end !== originalEnd;
      const statusChanged = values.status !== originalStatus;

      if (!timeChanged && !statusChanged) {
        cancelTeamEdit(teamName);
        return;
      }

      setState((prev) => ({ ...prev, mutating: true }));

      try {
        const response = await apiRequest<BulkUpdateResponse>('/api/shifts/bulk', 'POST', {
          groups: [
            {
              groupId: teamName,
              atomic: true,
              updates: [
                {
                  occurrenceId: team.mainShift.id,
                  startTime: values.start,
                  endTime: values.end,
                  status: values.status,
                },
                {
                  occurrenceId: team.assistShift.id,
                  startTime: values.start,
                  endTime: values.end,
                  status: values.status,
                },
              ],
            },
          ],
        });

        // Refresh schedule
        if (state.date) {
          await searchSchedule(state.date);
        }

        const groupResult = Array.isArray(response?.results) ? response.results[0] : null;
        if (response.summary === 'ok' && groupResult?.status === 'success') {
          showSuccess('Team updated successfully!');
          return;
        }

        const groupFailureMessage = summarizeGroupedFailure(response, 'Team update failed');
        showError(groupFailureMessage);

        reportErrorToOps({
          action: 'update_team_atomic_failed',
          userMessage: groupFailureMessage,
          error: { payload: response, status: 200, message: 'Atomic team update failed' },
          context: { teamName, startTime: values.start, endTime: values.end, status: values.status },
        }).then((report) => {
          if (report.triggered) {
            setState((prev) => ({
              ...prev,
              error: prev.error ? `${prev.error} Andrew was notified via Slack.` : null,
            }));
          }
        });
      } catch (error) {
        if (state.date) {
          await searchSchedule(state.date);
        }

        const userMessage = explainApiError(error, 'Could not update this team.');
        showError(userMessage);

        reportErrorToOps({
          action: 'update_team_request_failed',
          userMessage,
          error,
          context: { teamName, startTime: values.start, endTime: values.end, status: values.status },
        }).then((report) => {
          if (report.triggered) {
            setState((prev) => ({
              ...prev,
              error: prev.error ? `${prev.error} Andrew was notified via Slack.` : null,
            }));
          }
        });
      } finally {
        setState((prev) => ({ ...prev, mutating: false }));
      }
    },
    [state.teams, state.date, cancelTeamEdit, searchSchedule, showSuccess, showError]
  );

  const enterBulkEditMode = useCallback(() => {
    const bulkEditOriginalValues: Record<string, EditValues> = {};

    Object.keys(state.teams).forEach((teamName) => {
      const team = state.teams[teamName];
      bulkEditOriginalValues[teamName] = {
        start: getTimeFromDateTime(team.mainShift.dtstart),
        end: getTimeFromDateTime(team.mainShift.dtend),
        status: team.mainShift.status,
      };
    });

    setState((prev) => ({
      ...prev,
      bulkEditMode: true,
      editedValues: bulkEditOriginalValues,
    }));
  }, [state.teams]);

  const cancelBulkEdit = useCallback(() => {
    setState((prev) => ({
      ...prev,
      bulkEditMode: false,
      editedValues: {},
    }));
  }, []);

  const updateAllTeams = useCallback(
    async (changedTeams: Array<{ teamName: string; values: EditValues }>) => {
      if (changedTeams.length === 0) {
        cancelBulkEdit();
        return;
      }

      setState((prev) => ({
        ...prev,
        mutating: true,
        modal: { message: 'Processing Request', type: 'loading' },
      }));

      try {
        const groups = changedTeams.map((changed) => {
          const team = state.teams[changed.teamName];
          return {
            groupId: changed.teamName,
            atomic: true,
            updates: [
              {
                occurrenceId: team.mainShift.id,
                startTime: changed.values.start,
                endTime: changed.values.end,
                status: changed.values.status,
              },
              {
                occurrenceId: team.assistShift.id,
                startTime: changed.values.start,
                endTime: changed.values.end,
                status: changed.values.status,
              },
            ],
          };
        });

        const result = await apiRequest<BulkUpdateResponse>('/api/shifts/bulk', 'POST', { groups });

        if (state.date) {
          await searchSchedule(state.date);
        }

        if (result.summary === 'ok') {
          setState((prev) => ({
            ...prev,
            modal: { message: 'Shifts Updated Successfully', type: 'success' },
          }));
          setTimeout(() => {
            setState((prev) => ({ ...prev, modal: null, bulkEditMode: false, editedValues: {} }));
          }, 1500);
        } else {
          setState((prev) => ({
            ...prev,
            modal: {
              message: `Some teams were not updated (${result.counts.success}/${result.counts.total} teams).`,
              type: 'error',
            },
          }));
          setTimeout(() => {
            setState((prev) => ({ ...prev, modal: null }));
          }, 2500);

          const failureMessage = summarizeGroupedFailure(
            result,
            'Bulk update completed with failures'
          );
          showError(failureMessage);

          reportErrorToOps({
            action: 'update_all_teams_partial_failure',
            userMessage: failureMessage,
            error: { payload: result, status: 200, message: 'Bulk grouped update failed' },
            context: { teamCount: changedTeams.length },
          }).then((report) => {
            if (report.triggered) {
              setState((prev) => ({
                ...prev,
                error: prev.error ? `${prev.error} Andrew was notified via Slack.` : null,
              }));
            }
          });
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          modal: { message: 'Could not save team updates right now.', type: 'error' },
        }));
        setTimeout(() => {
          setState((prev) => ({ ...prev, modal: null }));
        }, 3000);

        const userMessage = explainApiError(error, 'Could not update teams right now.');
        showError(userMessage);

        reportErrorToOps({
          action: 'update_all_teams_request_failed',
          userMessage,
          error,
          context: { teamCount: changedTeams.length },
        }).then((report) => {
          if (report.triggered) {
            setState((prev) => ({
              ...prev,
              error: prev.error ? `${prev.error} Andrew was notified via Slack.` : null,
            }));
          }
        });
      } finally {
        setState((prev) => ({ ...prev, mutating: false }));
      }
    },
    [state.teams, state.date, cancelBulkEdit, searchSchedule, showError]
  );

  const editUnmatched = useCallback((index: number) => {
    setState((prev) => ({
      ...prev,
      unmatchedEditing: index,
    }));
  }, []);

  const cancelUnmatched = useCallback((_index: number) => {
    setState((prev) => ({
      ...prev,
      unmatchedEditing: null,
    }));
  }, []);

  const updateUnmatched = useCallback(
    async (index: number, values: EditValues) => {
      const shift = state.unmatchedShifts[index];
      if (!shift) return;

      const originalStart = getTimeFromDateTime(shift.dtstart);
      const originalEnd = getTimeFromDateTime(shift.dtend);
      const originalStatus = shift.status;

      const timeChanged = values.start !== originalStart || values.end !== originalEnd;
      const statusChanged = values.status !== originalStatus;

      if (!timeChanged && !statusChanged) {
        cancelUnmatched(index);
        return;
      }

      setState((prev) => ({ ...prev, mutating: true }));

      try {
        const result = await apiRequest(`/api/shifts/${encodeURIComponent(shift.id)}`, 'PUT', {
          startTime: values.start,
          endTime: values.end,
          status: values.status,
        });

        const updated = result.data && result.data.updatedShift ? result.data.updatedShift : null;
        if (updated) {
          setState((prev) => {
            const newUnmatched = [...prev.unmatchedShifts];
            newUnmatched[index] = {
              ...newUnmatched[index],
              dtstart: updated.dtstart,
              dtend: updated.dtend,
              status: updated.status,
            };
            return {
              ...prev,
              unmatchedShifts: newUnmatched,
              unmatchedEditing: null,
            };
          });
        } else {
          setState((prev) => ({ ...prev, unmatchedEditing: null }));
        }

        showSuccess(
          `Shift updated successfully!${result.requestId ? ` requestId: ${result.requestId}` : ''}`
        );
      } catch (error) {
        const userMessage = explainApiError(error, 'Could not update this shift.');
        showError(userMessage);

        reportErrorToOps({
          action: 'update_unmatched_shift_failed',
          userMessage,
          error,
          context: { unmatchedIndex: index, startTime: values.start, endTime: values.end, status: values.status },
        }).then((report) => {
          if (report.triggered) {
            setState((prev) => ({
              ...prev,
              error: prev.error ? `${prev.error} Andrew was notified via Slack.` : null,
            }));
          }
        });
      } finally {
        setState((prev) => ({ ...prev, mutating: false }));
      }
    },
    [state.unmatchedShifts, cancelUnmatched, showSuccess, showError]
  );

  const actions: ScheduleActions = {
    setDate,
    searchSchedule,
    editTeam,
    cancelTeamEdit,
    updateTeam,
    enterBulkEditMode,
    cancelBulkEdit,
    updateAllTeams,
    editUnmatched,
    cancelUnmatched,
    updateUnmatched,
    clearMessages,
    showError,
    showSuccess,
  };

  return [state, actions];
}
