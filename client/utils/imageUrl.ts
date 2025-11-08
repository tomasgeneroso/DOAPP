/**
 * Get full image URL from relative path
 * In development, prepends the API URL
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

  // If it's a relative path starting with /uploads
  if (path.startsWith('/uploads')) {
    // In development, use the API server URL
    if (import.meta.env.DEV) {
      return `http://localhost:5000${path}`;
    }
    // In production, use relative path
    return path;
  }

  // If it's just a filename, assume it's in uploads
  if (!path.startsWith('/')) {
    if (import.meta.env.DEV) {
      return `http://localhost:5000/uploads/${path}`;
    }
    return `/uploads/${path}`;
  }

  return path;
}
