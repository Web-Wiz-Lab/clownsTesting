import { useState, useEffect } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './StatusBadge';
import { TimeSelect } from './TimeSelect';
import { StatusSelect } from './StatusSelect';
import { formatTime, getTimeFromDateTime } from '@/lib/time';
import type { TeamData, EditValues } from '@/types/schedule';

interface TeamRowProps {
  team: TeamData;
  editing: boolean;
  bulkEditMode: boolean;
  bulkValues?: EditValues;
  onBulkValuesChange?: (values: EditValues) => void;
  onEdit: () => void;
  onCancel: () => void;
  onUpdate: (values: EditValues) => void;
  disabled?: boolean;
}

export function TeamRow({
  team,
  editing,
  bulkEditMode,
  bulkValues,
  onBulkValuesChange,
  onEdit,
  onCancel,
  onUpdate,
  disabled = false,
}: TeamRowProps) {
  const originalStart = getTimeFromDateTime(team.mainShift.dtstart);
  const originalEnd = getTimeFromDateTime(team.mainShift.dtend);
  const originalStatus = team.mainShift.status;

  const [startTime, setStartTime] = useState(originalStart);
  const [endTime, setEndTime] = useState(originalEnd);
  const [status, setStatus] = useState<'published' | 'planning'>(originalStatus);
  const [updating, setUpdating] = useState(false);

  // Reset values when single-team editing starts
  useEffect(() => {
    if (editing && !bulkEditMode) {
      setStartTime(originalStart);
      setEndTime(originalEnd);
      setStatus(originalStatus);
    }
  }, [editing, bulkEditMode, originalStart, originalEnd, originalStatus]);

  const effectiveStart = bulkEditMode ? (bulkValues?.start || originalStart) : startTime;
  const effectiveEnd = bulkEditMode ? (bulkValues?.end || originalEnd) : endTime;
  const effectiveStatus = bulkEditMode ? (bulkValues?.status || originalStatus) : status;

  const hasChanges =
    effectiveStart !== originalStart ||
    effectiveEnd !== originalEnd ||
    effectiveStatus !== originalStatus;

  const handleUpdate = async () => {
    setUpdating(true);
    await onUpdate({ start: effectiveStart, end: effectiveEnd, status: effectiveStatus });
    setUpdating(false);
  };

  const handleStartTimeChange = (newStart: string) => {
    const baseEnd = bulkEditMode ? effectiveEnd : endTime;

    let nextEnd = baseEnd;
    // Reset end time if it's now before or equal to start time
    const newStartMinutes = parseInt(newStart.split(':')[0]) * 60 + parseInt(newStart.split(':')[1]);
    const endMinutes = parseInt(baseEnd.split(':')[0]) * 60 + parseInt(baseEnd.split(':')[1]);
    if (endMinutes <= newStartMinutes) {
      // Set to 15 minutes after new start as default
      const newEndMinutes = newStartMinutes + 15;
      const newEndHours = Math.floor(newEndMinutes / 60);
      const newEndMins = newEndMinutes % 60;
      if (newEndHours < 24) {
        nextEnd = `${newEndHours.toString().padStart(2, '0')}:${newEndMins
          .toString()
          .padStart(2, '0')}`;
      }
    }

    if (bulkEditMode) {
      onBulkValuesChange?.({
        start: newStart,
        end: nextEnd,
        status: effectiveStatus,
      });
      return;
    }

    setStartTime(newStart);
    setEndTime(nextEnd);
  };

  if (!editing && !bulkEditMode) {
    // Display mode
    return (
      <TableRow>
        <TableCell>
          <span className="font-bold">{team.teamName}</span>
        </TableCell>
        <TableCell>{team.mainName}</TableCell>
        <TableCell>{team.assistName}</TableCell>
        <TableCell>{formatTime(team.mainShift.dtstart)}</TableCell>
        <TableCell>{formatTime(team.mainShift.dtend)}</TableCell>
        <TableCell>
          <StatusBadge status={team.mainShift.status} />
        </TableCell>
        <TableCell>
          <Button variant="outline" size="sm" onClick={onEdit} disabled={disabled}>
            Edit
          </Button>
        </TableCell>
      </TableRow>
    );
  }

  // Edit mode
  return (
    <TableRow className={hasChanges ? 'edited-row' : ''}>
      <TableCell>
        <span className="font-bold">{team.teamName}</span>
      </TableCell>
      <TableCell>{team.mainName}</TableCell>
      <TableCell>{team.assistName}</TableCell>
      <TableCell>
        <TimeSelect value={effectiveStart} onChange={handleStartTimeChange} className="w-36" />
      </TableCell>
      <TableCell>
        <TimeSelect
          value={effectiveEnd}
          onChange={(value) => {
            if (bulkEditMode) {
              onBulkValuesChange?.({
                start: effectiveStart,
                end: value,
                status: effectiveStatus,
              });
              return;
            }
            setEndTime(value);
          }}
          minTime={effectiveStart}
          className="w-36"
        />
      </TableCell>
      <TableCell>
        <StatusSelect
          value={effectiveStatus}
          onChange={(value) => {
            if (bulkEditMode) {
              onBulkValuesChange?.({
                start: effectiveStart,
                end: effectiveEnd,
                status: value,
              });
              return;
            }
            setStatus(value);
          }}
          className="w-36"
        />
      </TableCell>
      <TableCell>
        {!bulkEditMode && (
          <div className="flex gap-2">
            <Button size="sm" onClick={handleUpdate} disabled={updating}>
              {updating ? 'Updating...' : 'Update'}
            </Button>
            <Button variant="outline" size="sm" onClick={onCancel} disabled={updating}>
              Cancel
            </Button>
          </div>
        )}
      </TableCell>
    </TableRow>
  );
}
