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
  data_domain_id?: number;
  review_comment?: string;
  submitted_at?: string;
  reviewed_at?: string;
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

export interface ReviewHistoryContributionPayload {
  action: 'approve' | 'return' | 'reject';
  review_comment: string;
}

export interface UploadHistoryAttachmentPayload {
  description: string;
  source_note: string;
  rights_note: string;
  consent_confirmed: boolean;
}

export interface HistoryAttachmentUploadResult {
  id: number;
  upload_url: string;
  expires_in: number;
}
