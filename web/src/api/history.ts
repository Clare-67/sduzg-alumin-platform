import { request } from './http';
import type {
  CreateHistoryContributionPayload,
  HistoryContribution,
  HistoryAttachmentUploadResult,
  HistoryEntry,
  ReviewHistoryContributionPayload,
  UploadHistoryAttachmentPayload,
} from '../types/history';

const toSameOriginStorageURL = (presignedURL: string) => {
  const url = new URL(presignedURL);
  return `${window.location.origin}${url.pathname}${url.search}`;
};

export const historyApi = {
  listEntries(keyword?: string) {
    return request<HistoryEntry[]>({ method: 'GET', url: '/history/entries', params: keyword ? { keyword } : undefined });
  },
  getEntry(id: number) {
    return request<HistoryEntry>({ method: 'GET', url: `/history/entries/${id}` });
  },
  listMine() {
    return request<HistoryContribution[]>({ method: 'GET', url: '/history/contributions/me' });
  },
  createDraft(payload: CreateHistoryContributionPayload) {
    return request<HistoryContribution>({ method: 'POST', url: '/history/contributions', data: payload });
  },
  submit(id: number) {
    return request<HistoryContribution>({ method: 'POST', url: `/history/contributions/${id}/submit` });
  },
  async uploadAttachment(id: number, file: File, payload: UploadHistoryAttachmentPayload) {
    const attachment = await request<HistoryAttachmentUploadResult>({
      method: 'POST',
      url: `/history/contributions/${id}/attachments/upload-url`,
      data: { original_name: file.name, mime_type: file.type, ...payload },
    });
    const putResponse = await fetch(toSameOriginStorageURL(attachment.upload_url), {
      method: 'PUT',
      body: file,
      headers: { 'Content-Type': file.type },
    });
    if (!putResponse.ok) throw new Error(`附件上传失败：${putResponse.status}`);
    await request({ method: 'POST', url: `/history/contributions/${id}/attachments/${attachment.id}/confirm` });
  },
  listPending() {
    return request<HistoryContribution[]>({ method: 'GET', url: '/history/reviews' });
  },
  review(id: number, payload: ReviewHistoryContributionPayload) {
    return request<HistoryContribution>({ method: 'POST', url: `/history/reviews/${id}`, data: payload });
  },
};
