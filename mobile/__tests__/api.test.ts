// Mock native storage so api.ts can load and we can control the stored token.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

import * as SecureStore from 'expo-secure-store';
import { get, post, put, del, upload } from '../services/api';

const mockSecure = SecureStore as jest.Mocked<typeof SecureStore>;

// Build a fake fetch Response-like object (api.ts only uses .ok and .text()).
function fakeResponse(body: unknown, ok = true) {
  return {
    ok,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

describe('mobile api client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSecure.getItemAsync.mockResolvedValue(null);
    global.fetch = jest.fn();
  });

  it('GET hits the endpoint with method GET and returns parsed data', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeResponse({ success: true, data: [1, 2] }));

    const res = await get<number[]>('/jobs');

    expect(res).toEqual({ success: true, data: [1, 2] });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toMatch(/\/jobs$/);
    expect(init.method).toBe('GET');
  });

  it('injects the Bearer token when one is stored', async () => {
    mockSecure.getItemAsync.mockResolvedValue('tok-123');
    (global.fetch as jest.Mock).mockResolvedValue(fakeResponse({ success: true }));

    await get('/profile');

    const init = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(init.headers.Authorization).toBe('Bearer tok-123');
  });

  it('omits Authorization when includeAuth is false', async () => {
    mockSecure.getItemAsync.mockResolvedValue('tok-123');
    (global.fetch as jest.Mock).mockResolvedValue(fakeResponse({ success: true }));

    await get('/public', false);

    const init = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(init.headers.Authorization).toBeUndefined();
    expect(mockSecure.getItemAsync).not.toHaveBeenCalled();
  });

  it('POST/PUT serialize the body as JSON', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeResponse({ success: true }));

    await post('/jobs', { title: 'x' });
    let init = (global.fetch as jest.Mock).mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'x' }));
    expect(init.headers['Content-Type']).toBe('application/json');

    await put('/jobs/1', { title: 'y' });
    init = (global.fetch as jest.Mock).mock.calls[1][1];
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ title: 'y' }));
  });

  it('DELETE uses method DELETE', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeResponse({ success: true }));
    await del('/jobs/1');
    expect((global.fetch as jest.Mock).mock.calls[0][1].method).toBe('DELETE');
  });

  it('maps a non-ok response to success:false with the server message', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      fakeResponse({ message: 'Forbidden', error: 'FORBIDDEN' }, false),
    );

    const res = await get('/admin');

    expect(res).toEqual({ success: false, message: 'Forbidden', error: 'FORBIDDEN' });
  });

  it('returns PARSE_ERROR for a non-JSON response', async () => {
    (global.fetch as jest.Mock).mockResolvedValue(fakeResponse('<html>502</html>'));

    const res = await get('/jobs');

    expect(res.success).toBe(false);
    expect(res.error).toBe('PARSE_ERROR');
  });

  it('returns NETWORK_ERROR when fetch rejects', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('boom'));

    const res = await get('/jobs');

    expect(res.success).toBe(false);
    expect(res.error).toBe('NETWORK_ERROR');
  });

  it('returns TIMEOUT when the request is aborted', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    (global.fetch as jest.Mock).mockRejectedValue(abort);

    const res = await get('/jobs');

    expect(res.success).toBe(false);
    expect(res.error).toBe('TIMEOUT');
  });

  describe('upload', () => {
    it('sends multipart without a JSON Content-Type and with the Bearer token', async () => {
      mockSecure.getItemAsync.mockResolvedValue('tok-9');
      (global.fetch as jest.Mock).mockResolvedValue(fakeResponse({ success: true, data: { id: 'a' } }));
      const fd = new FormData();

      const res = await upload('/portfolio', fd);

      expect(res).toEqual({ success: true, data: { id: 'a' } });
      const init = (global.fetch as jest.Mock).mock.calls[0][1];
      expect(init.method).toBe('POST');
      expect(init.body).toBe(fd);
      expect(init.headers['Content-Type']).toBeUndefined();
      expect(init.headers.Authorization).toBe('Bearer tok-9');
    });

    it('maps upload network failures to NETWORK_ERROR', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('down'));

      const res = await upload('/portfolio', new FormData());

      expect(res).toEqual({ success: false, message: 'down', error: 'NETWORK_ERROR' });
    });
  });
});
