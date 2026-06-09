// Storage helpers in api.ts use SecureStore on native (Platform.OS !== 'web').
// jest-expo reports a native platform, so mock expo-secure-store.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import {
  getToken,
  setToken,
  removeToken,
  setUser,
  getUser,
  removeUser,
  clearAuth,
} from '../services/api';

const mockSecure = SecureStore as jest.Mocked<typeof SecureStore>;

describe('auth storage helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('setToken / getToken round-trip via SecureStore', async () => {
    await setToken('abc');
    expect(mockSecure.setItemAsync).toHaveBeenCalledWith('auth_token', 'abc');

    mockSecure.getItemAsync.mockResolvedValue('abc');
    expect(await getToken()).toBe('abc');
  });

  it('getToken returns null and swallows storage errors', async () => {
    mockSecure.getItemAsync.mockRejectedValue(new Error('keychain unavailable'));
    expect(await getToken()).toBeNull();
  });

  it('removeToken deletes the stored key', async () => {
    await removeToken();
    expect(mockSecure.deleteItemAsync).toHaveBeenCalledWith('auth_token');
  });

  it('setUser serializes and getUser parses the user object', async () => {
    const user = { id: 'u1', name: 'Ana' };
    await setUser(user);
    expect(mockSecure.setItemAsync).toHaveBeenCalledWith('auth_user', JSON.stringify(user));

    mockSecure.getItemAsync.mockResolvedValue(JSON.stringify(user));
    expect(await getUser()).toEqual(user);
  });

  it('getUser returns null when nothing is stored', async () => {
    mockSecure.getItemAsync.mockResolvedValue(null);
    expect(await getUser()).toBeNull();
  });

  it('clearAuth removes both token and user', async () => {
    await clearAuth();
    expect(mockSecure.deleteItemAsync).toHaveBeenCalledWith('auth_token');
    expect(mockSecure.deleteItemAsync).toHaveBeenCalledWith('auth_user');
  });
});
