export interface ShiftData {
  id: string;
  dtstart: string;
  dtend: string;
  status: 'published' | 'planning';
  user: {
    id: string | number;
  };
}

export interface TeamMemberShift {
  name: string;
  slingId: string | number;
  shift: {
    id: string;
    dtstart: string;
    dtend: string;
    status: 'published' | 'planning';
  };
}

export interface TeamData {
  teamName: string;
  mainName: string;
  assistName: string;
  mainShift: ShiftData;
  assistShift: ShiftData;
}

export interface UnmatchedShift {
  id: string;
  dtstart: string;
  dtend: string;
  status: 'published' | 'planning';
  user: {
    id: string | number;
  };
  displayName: string;
}

export interface ScheduleResponse {
  teams: Array<{
    teamName: string;
    main: TeamMemberShift;
    assist: TeamMemberShift;
  }>;
  unmatched: Array<{
    name: string;
    shift: {
      id: string;
      dtstart: string;
      dtend: string;
      status: 'published' | 'planning';
      userId?: string | number;
    };
  }>;
}

export interface EditValues {
  start: string;
  end: string;
  status: 'published' | 'planning';
}

export interface BulkUpdateGroup {
  groupId: string;
  atomic: boolean;
  updates: Array<{
    occurrenceId: string;
    startTime: string;
    endTime: string;
    status: 'published' | 'planning';
  }>;
}

export interface BulkUpdateResponse {
  summary: 'ok' | 'partial' | 'failed';
  counts: {
    total: number;
    success: number;
    failed: number;
  };
  results: Array<{
    groupId: string;
    status: 'success' | 'failed';
    rolledBack?: boolean;
    failure?: any;
    results?: any[];
  }>;
  requestId?: string;
}
