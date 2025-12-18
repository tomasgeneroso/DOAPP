/**
 * Get full image URL from relative path
 * Uses Vite proxy in development (configured in vite.config.ts)
 * In production, uses relative paths
 */
export function getImageUrl(path: string | undefined): string {
  if (!path) {
    return '/default-avatar.png';
  }

  // If it's already a full URL, return as is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // If it's a relative path starting with /uploads, return as-is
  // Vite proxy will handle routing to the backend
  if (path.startsWith('/uploads')) {
    return path;
  }

  // If it's just a filename, assume it's in uploads
  if (!path.startsWith('/')) {
    return `/uploads/${path}`;
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
