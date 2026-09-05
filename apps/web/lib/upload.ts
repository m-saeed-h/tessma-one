import { api } from './api';

// SEC-APP-06 / Build Guide §5: "never save files onto the server's own
// disk" — the browser uploads bytes directly to object storage via a
// short-lived signed URL; the API process is never in the data path. This
// is the two-step contract documents.service.ts already exposes
// (upload-url, then confirm), used here by receipt capture (FR-EXP-002) and
// purchase-invoice attachment (FR-PIN-002).
export async function uploadDocument(file: File, resourceType: string, resourceId: string): Promise<string> {
  const { documentId, uploadUrl } = await api('/documents/upload-url', {
    method: 'POST',
    body: JSON.stringify({ filename: file.name, mimeType: file.type, resourceType, resourceId }),
  });
  const res = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
  if (!res.ok) throw new Error('Upload to storage failed');
  await api(`/documents/${documentId}/confirm`, { method: 'POST' });
  return documentId;
}
