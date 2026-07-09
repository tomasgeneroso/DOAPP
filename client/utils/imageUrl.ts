/**
 * Resolve an uploaded-file path to a URL that actually loads in production.
 *
 * Uploads are served by the backend, and nginx proxies /api to the backend but
 * usually NOT /uploads. So we route every uploaded file through the API base
 * (which IS proxied): the backend also serves the files under /api/uploads.
 *   - dev:  VITE_API_URL = http://localhost:3001/api  → http://localhost:3001/api/uploads/...
 *   - prod: VITE_API_URL = https://site/api           → https://site/api/uploads/...
 *   - fallback (no env): same-origin "/api"           → /api/uploads/...
 */
function getApiBase(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl && apiUrl.trim()) return apiUrl.replace(/\/+$/, '');
  return '/api';
}
const API_BASE = getApiBase();

export function getImageUrl(path: string | undefined | null): string {
  if (!path) {
    return 'https://api.dicebear.com/7.x/shapes/svg?seed=default&backgroundColor=0ea5e9';
  }

  // Already a full URL (external avatars, etc.) or an in-memory/local preview
  // (blob: from URL.createObjectURL, data: URIs) — leave these untouched.
  if (
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('blob:') ||
    path.startsWith('data:')
  ) {
    return path;
  }

  // Stored as "/uploads/job-images/x.jpg" → "<api>/uploads/job-images/x.jpg"
  if (path.startsWith('/uploads')) {
    return `${API_BASE}${path}`;
  }
  // Stored as "uploads/job-images/x.jpg"
  if (path.startsWith('uploads/')) {
    return `${API_BASE}/${path}`;
  }
  // Bare filename → assume it lives at the uploads root
  if (!path.startsWith('/')) {
    return `${API_BASE}/uploads/${path}`;
  }

  // Any other absolute-ish path: route it through the API base too
  return `${API_BASE}${path}`;
}

/**
 * Get avatar URL with fallback to generated avatar
 */
export function getAvatarUrl(avatar: string | undefined | null, name?: string, id?: string): string {
  if (avatar) {
    return getImageUrl(avatar);
  }
  const seed = name || id || 'user';
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0ea5e9&textColor=ffffff`;
}
