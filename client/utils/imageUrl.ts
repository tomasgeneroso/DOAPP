/**
 * Get the backend base URL for serving uploads
 * In development, Vite proxy handles /uploads → backend
 * In production, we need to prefix with the API server URL
 */
const BACKEND_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace(/\/api$/, '')
  : '';

/**
 * Get full image URL from relative path
 */
export function getImageUrl(path: string | undefined): string {
  if (!path) {
    return '/default-avatar.png';
  }

  // If it's already a full URL, return as is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // If it's a relative path starting with /uploads, prefix with backend URL
  if (path.startsWith('/uploads')) {
    return `${BACKEND_URL}${path}`;
  }

  // If it's just a filename, assume it's in uploads
  if (!path.startsWith('/')) {
    return `${BACKEND_URL}/uploads/${path}`;
  }

  return path;
}

/**
 * Get avatar URL with fallback to generated avatar
 * Uses DiceBear API to generate consistent avatars based on name/id
 */
export function getAvatarUrl(avatar: string | undefined | null, name?: string, id?: string): string {
  // If avatar is provided and valid, use it
  if (avatar) {
    return getImageUrl(avatar);
  }

  // Generate a consistent seed from name or id
  const seed = name || id || 'user';

  // Use DiceBear initials style for a cleaner look
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(seed)}&backgroundColor=0ea5e9&textColor=ffffff`;
}
