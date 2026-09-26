import type {
  AuthErrorCode,
  AuthResponse,
  FriendErrorCode,
  FriendsOverview,
  Profile,
  ShopErrorCode,
} from '@rmc/shared-types';

// Default: jis address se page khula hai wahi host, port 3000 (phone par localhost galat hota).
const API_URL = import.meta.env.VITE_API_URL ?? `http://${window.location.hostname}:3000`;
const AUTH_KEY = 'rmc:auth';

/** Code jo UI ke autherr.* text se match hota hai (NETWORK = server tak pahunche hi nahi). */
export type AuthUiError = AuthErrorCode | 'NETWORK';

/** Friends API ke error codes (UI ke frerr.* text se match). */
export type FriendUiError = FriendErrorCode | 'NETWORK';

/** Shop API ke error codes (UI ke shoperr.* text se match). */
export type ShopUiError = ShopErrorCode | 'NETWORK';

export class ApiError extends Error {
  constructor(public readonly code: AuthUiError | FriendUiError | ShopUiError) {
    super(code);
  }
}

export function loadAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_KEY);
  } catch {
    return null;
  }
}

export function saveAuthToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(AUTH_KEY, token);
    else localStorage.removeItem(AUTH_KEY);
  } catch {
    // storage band ho to session sirf is tab tak chalega
  }
}

export async function request<T>(method: string, path: string, body?: unknown, token?: string | null): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('NETWORK');
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as {
      code?: AuthErrorCode | FriendErrorCode | ShopErrorCode;
    } | null;
    throw new ApiError(data?.code ?? 'NETWORK');
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const authApi = {
  register: (username: string, password: string) =>
    request<AuthResponse>('POST', '/auth/register', { username, password }),
  login: (username: string, password: string) =>
    request<AuthResponse>('POST', '/auth/login', { username, password }),
  me: (token: string) => request<Profile>('GET', '/me', undefined, token),
  logout: (token: string) => request<void>('POST', '/auth/logout', undefined, token),
};

export const shopApi = {
  purchase: (token: string, characterId: string) =>
    request<Profile>('POST', '/shop/purchase', { characterId }, token),
  equip: (token: string, characterId: string) => request<Profile>('POST', '/shop/equip', { characterId }, token),
};

export const friendsApi = {
  overview: (token: string) => request<FriendsOverview>('GET', '/friends', undefined, token),
  request: (token: string, username: string) =>
    request<{ result: 'REQUESTED' | 'ACCEPTED' }>('POST', '/friends/requests', { username }, token),
  accept: (token: string, accountId: string) =>
    request<void>('POST', `/friends/requests/${encodeURIComponent(accountId)}/accept`, undefined, token),
  decline: (token: string, accountId: string) =>
    request<void>('DELETE', `/friends/requests/${encodeURIComponent(accountId)}`, undefined, token),
  unfriend: (token: string, accountId: string) =>
    request<void>('DELETE', `/friends/${encodeURIComponent(accountId)}`, undefined, token),
};
