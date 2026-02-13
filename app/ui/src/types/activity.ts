export interface ActivityGroup {
  groupId: string;
  status: string;
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  outcome: 'success' | 'failure' | 'partial';
  type: 'single' | 'bulk';
  summary: string;
  scheduleDate: string | null;
  requestId: string | null;
  groups: ActivityGroup[];
}

export interface ActivityResponse {
  requestId: string;
  entries: ActivityEntry[];
  nextCursor: string | null;
}

export interface ChangelogDay {
  date: string;
  entries: string[];
  clearInvestigating?: boolean;
}
