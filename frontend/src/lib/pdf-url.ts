import { API_BASE_URL } from './api-client';

const googleDriveFileId = (url: string): string | null => {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'drive.google.com') return null;

    const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
    if (pathMatch?.[1]) return pathMatch[1];

    return parsed.searchParams.get('id');
  } catch {
    return null;
  }
};

export const resolvePdfUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;

  const apiBase = API_BASE_URL.endsWith('/api/v1')
    ? API_BASE_URL.slice(0, -7)
    : API_BASE_URL;
  return `${apiBase}${url}`;
};

export const resolvePdfEmbedUrl = (url: string | null | undefined): string => {
  const resolvedUrl = resolvePdfUrl(url);
  const driveFileId = googleDriveFileId(resolvedUrl);
  return driveFileId
    ? `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/preview`
    : resolvedUrl;
};
