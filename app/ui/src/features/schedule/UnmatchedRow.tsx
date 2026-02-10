import { useState, useEffect } from 'react';
import { TableRow, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { StatusBadge } from './StatusBadge';
import { TimeSelect } from './TimeSelect';
import { StatusSelect } from './StatusSelect';
import { formatTime, getTimeFromDateTime } from '@/lib/time';
import type { UnmatchedShift, EditValues } from '@/types/schedule';
import { cn } from '@/lib/utils';

interface UnmatchedRowProps {
  shift: UnmatchedShift;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onUpdate: (values: EditValues) => void;
  flashSuccess?: boolean;
}

export function UnmatchedRow({
  shift,
  editing,
  onEdit,
  onCancel,
  onUpdate,
  flashSuccess = false,
}: UnmatchedRowProps) {
  const originalStart = getTimeFromDateTime(shift.dtstart);
  const originalEnd = getTimeFromDateTime(shift.dtend);
  const originalStatus = shift.status;

  const [startTime, setStartTime] = useState(originalStart);
  const [endTime, setEndTime] = useState(originalEnd);
  const [status, setStatus] = useState<'published' | 'planning'>(originalStatus);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (editing) {
      setStartTime(originalStart);
      setEndTime(originalEnd);
      setStatus(originalStatus);
    }
  }, [editing, originalStart, originalEnd, originalStatus]);

  const hasChanges =
    startTime !== originalStart || endTime !== originalEnd || status !== originalStatus;

  const handleUpdate = async () => {
    setUpdating(true);
    await onUpdate({ start: startTime, end: endTime, status });
    setUpdating(false);
  };

  const handleStartTimeChange = (newStart: string) => {
    setStartTime(newStart);
    const newStartMinutes = parseInt(newStart.split(':')[0]) * 60 + parseInt(newStart.split(':')[1]);
    const endMinutes = parseInt(endTime.split(':')[0]) * 60 + parseInt(endTime.split(':')[1]);
    if (endMinutes <= newStartMinutes) {
      const newEndMinutes = newStartMinutes + 15;
      const newEndHours = Math.floor(newEndMinutes / 60);
      const newEndMins = newEndMinutes % 60;
      if (newEndHours < 24) {
        setEndTime(
          `${newEndHours.toString().padStart(2, '0')}:${newEndMins.toString().padStart(2, '0')}`
        );
      }
    }
  };

  if (!editing) {
    return (
      <TableRow className={cn(flashSuccess && 'flash-success')}>
        <TableCell>
          <strong>{shift.displayName}</strong>
        </TableCell>
        <TableCell>{formatTime(shift.dtstart)}</TableCell>
        <TableCell>{formatTime(shift.dtend)}</TableCell>
        <TableCell>
          <StatusBadge status={shift.status} />
        </TableCell>
        <TableCell>
          <Button variant="outline" size="sm" onClick={onEdit}>
            Edit
          </Button>
        </TableCell>
      </TableRow>
    );
  }

  return (
    <TableRow className={hasChanges ? 'edited-row' : ''}>
      <TableCell>
        <strong>{shift.displayName}</strong>
      </TableCell>
      <TableCell>
        <TimeSelect value={startTime} onChange={handleStartTimeChange} className="w-36" />
      </TableCell>
      <TableCell>
        <TimeSelect value={endTime} onChange={setEndTime} minTime={startTime} className="w-36" />
      </TableCell>
      <TableCell>
        <StatusSelect value={status} onChange={setStatus} className="w-36" />
      </TableCell>
      <TableCell>
        <div className="flex gap-2">
          <Button size="sm" onClick={handleUpdate} disabled={updating}>
            {updating ? 'Updating...' : 'Update'}
          </Button>
          <Button variant="outline" size="sm" onClick={onCancel} disabled={updating}>
            Cancel
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
