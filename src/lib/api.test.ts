import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './api';
import type { AuthResponse } from './types';

const authResponse: AuthResponse = {
  accessToken: 'access-1',
  expiresIn: 900,
  sessionId: 'sess-1',
  refreshToken: 'refresh-1',
  user: { id: 'u1', email: 'a@b.com', displayName: 'A', roles: ['administrator'], disabled: false },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('ApiClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists auth material on login', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(authResponse));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('/api');
    const user = await client.login('a@b.com', 'pw');

    expect(user.email).toBe('a@b.com');
    expect(client.isAuthenticated).toBe(true);
    expect(localStorage.getItem('orchestrator.auth')).toContain('refresh-1');
  });

  it('surfaces the backend error envelope as an ApiError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          statusCode: 401,
          message: 'Invalid credentials.',
          error: 'Unauthorized',
          correlationId: 'c1',
        },
        401,
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('/api');
    await expect(client.login('a@b.com', 'bad')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid credentials.',
      correlationId: 'c1',
    });
  });

  it('refreshes once on a 401 then retries the original request', async () => {
    localStorage.setItem(
      'orchestrator.auth',
      JSON.stringify({ sessionId: 'sess-1', refreshToken: 'refresh-1' }),
    );
    const fetchMock = vi
      .fn()
      // 1) initial /users → 401
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      // 2) /auth/refresh → new tokens
      .mockResolvedValueOnce(jsonResponse({ ...authResponse, accessToken: 'access-2' }))
      // 3) retried /users → 200
      .mockResolvedValueOnce(jsonResponse([authResponse.user]));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('/api');
    const users = await client.listUsers();

    expect(users).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0] as string).toContain('/auth/refresh');
  });

  it('clears auth when refresh fails', async () => {
    localStorage.setItem(
      'orchestrator.auth',
      JSON.stringify({ sessionId: 'sess-1', refreshToken: 'bad' }),
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 401 }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('/api');
    await expect(client.listUsers()).rejects.toBeInstanceOf(ApiError);
    expect(client.isAuthenticated).toBe(false);
  });
});
