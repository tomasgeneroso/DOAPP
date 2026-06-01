// Mock native AsyncStorage so api.ts (which imports it) can load under Node.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

import { getImageUrl } from '../services/api';

describe('getImageUrl', () => {
  it('returns undefined for empty/nullish input', () => {
    expect(getImageUrl(undefined)).toBeUndefined();
    expect(getImageUrl(null)).toBeUndefined();
    expect(getImageUrl('')).toBeUndefined();
  });

  it('passes through absolute URLs unchanged', () => {
    expect(getImageUrl('https://cdn.example.com/a.png')).toBe('https://cdn.example.com/a.png');
    expect(getImageUrl('http://cdn.example.com/a.png')).toBe('http://cdn.example.com/a.png');
  });

  it('prefixes /uploads paths with the uploads base URL', () => {
    const result = getImageUrl('/uploads/avatars/x.png');
    expect(result).toMatch(/\/uploads\/avatars\/x\.png$/);
    expect(result).toMatch(/^https?:\/\//);
  });

  it('treats a bare filename as an uploads file', () => {
    const result = getImageUrl('x.png');
    expect(result).toMatch(/\/uploads\/x\.png$/);
  });

  it('returns other absolute paths unchanged', () => {
    expect(getImageUrl('/legal/terms.txt')).toBe('/legal/terms.txt');
  });
});
