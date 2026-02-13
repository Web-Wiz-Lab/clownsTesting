import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { TeamRow } from './TeamRow';
import type { TeamData, EditValues } from '@/types/schedule';

interface TeamsTableProps {
  teams: Record<string, TeamData>;
  editingTeam: string | null;
  bulkEditMode: boolean;
  mutating?: boolean;
  bulkEditedValues: Record<string, EditValues>;
  onBulkValuesChange: (teamName: string, values: EditValues) => void;
  onEditTeam: (teamName: string) => void;
  onCancelTeamEdit: (teamName: string) => void;
  onUpdateTeam: (teamName: string, values: EditValues) => void;
}

export function TeamsTable({
  teams,
  editingTeam,
  bulkEditMode,
  mutating = false,
  bulkEditedValues,
  onBulkValuesChange,
  onEditTeam,
  onCancelTeamEdit,
  onUpdateTeam,
}: TeamsTableProps) {
  const teamNames = Object.keys(teams);

  if (teamNames.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border-2 bg-white shadow-md overflow-hidden">
      <Table className="text-sm">
        <TableHeader className="bg-gradient-to-r from-muted/60 to-muted/40">
          <TableRow className="border-b-2">
            <TableHead className="font-semibold text-xs text-muted-foreground h-12">
              Team Name
            </TableHead>
            <TableHead className="font-semibold text-xs text-muted-foreground h-12">
              Main Person
            </TableHead>
            <TableHead className="font-semibold text-xs text-muted-foreground h-12">
              Helper
            </TableHead>
            <TableHead className="font-semibold text-xs text-muted-foreground h-12">
              Start Time
            </TableHead>
            <TableHead className="font-semibold text-xs text-muted-foreground h-12">
              End Time
            </TableHead>
            <TableHead className="font-semibold text-xs text-muted-foreground h-12">
              Status
            </TableHead>
            <TableHead className="font-semibold text-xs text-muted-foreground h-12">
              Actions
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {teamNames.map((teamName) => (
            <TeamRow
              key={teamName}
              team={teams[teamName]}
              editing={editingTeam === teamName || bulkEditMode}
              bulkEditMode={bulkEditMode}
              bulkValues={bulkEditedValues[teamName]}
              onBulkValuesChange={(values) => onBulkValuesChange(teamName, values)}
              onEdit={() => onEditTeam(teamName)}
              onCancel={() => onCancelTeamEdit(teamName)}
              onUpdate={(values) => onUpdateTeam(teamName, values)}
              disabled={mutating || (editingTeam !== null && editingTeam !== teamName)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
