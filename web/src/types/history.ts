export type HistoryContributionStatus = 'draft' | 'pending' | 'returned' | 'approved' | 'rejected';

export interface HistoryEntry {
  id: number;
  title: string;
  summary: string;
  content: string;
  current_version: number;
  updated_at: string;
}

export interface HistoryContribution {
  id: number;
  entry_id?: number;
  title: string;
  section_name: string;
  content: string;
  source_note: string;
  change_note: string;
  status: HistoryContributionStatus;
  review_comment?: string;
  updated_at: string;
}

export interface CreateHistoryContributionPayload {
  entry_id?: number;
  title: string;
  section_name?: string;
  content: string;
  source_note: string;
  change_note?: string;
}

export interface UploadHistoryAttachmentPayload {
  description: string;
  source_note: string;
  rights_note: string;
  consent_confirmed: boolean;
}

interface HistoryAttachmentUploadResult {
  id: number;
  upload_url: string;
}

export type { HistoryAttachmentUploadResult };
