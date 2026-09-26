import { useCallback, useEffect, useState } from 'react';
import type { AuthResponse, Profile } from '@rmc/shared-types';
import {
  ApiError,
  authApi,
  loadAuthToken,
  saveAuthToken,
  shopApi,
  type AuthUiError,
  type ShopUiError,
} from './authApi';

/** Login state + profile. Profile hamesha server se aata hai; browser kuch calculate nahi karta. */
export function useAuth() {
  const [authToken, setAuthToken] = useState<string | null>(loadAuthToken);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<AuthUiError | null>(null);
  const [busy, setBusy] = useState(false);

  const clear = useCallback(() => {
    saveAuthToken(null);
    setAuthToken(null);
    setProfile(null);
  }, []);

  const refresh = useCallback(async () => {
    const token = loadAuthToken();
    if (!token) return;
    try {
      setProfile(await authApi.me(token));
    } catch (e) {
      // Token expire/invalid: logout. Network error par login rehne do.
      if (e instanceof ApiError && e.code === 'UNAUTHORIZED') clear();
    }
  }, [clear]);

  useEffect(() => {
    if (authToken) void refresh();
  }, [authToken, refresh]);

  const submit = useCallback(async (mode: 'login' | 'register', username: string, password: string) => {
    setBusy(true);
    setError(null);
    try {
      const res: AuthResponse = await authApi[mode](username, password);
      saveAuthToken(res.authToken);
      setAuthToken(res.authToken);
      setProfile(res.profile);
    } catch (e) {
      // Auth endpoints sirf auth codes (ya NETWORK) dete hain.
      setError(e instanceof ApiError ? (e.code as AuthUiError) : 'NETWORK');
    } finally {
      setBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    const token = loadAuthToken();
    clear();
    if (token) await authApi.logout(token).catch(() => undefined);
  }, [clear]);

  const [shopError, setShopError] = useState<ShopUiError | null>(null);

  /** Shop ka kaam. Nateeja poora naya profile hai (coins, owned, equipped) jo server ne bheja. */
  const shop = useCallback(async (action: 'purchase' | 'equip', characterId: string) => {
    const token = loadAuthToken();
    if (!token) return;
    setShopError(null);
    try {
      setProfile(await shopApi[action](token, characterId));
    } catch (e) {
      setShopError(e instanceof ApiError ? (e.code as ShopUiError) : 'NETWORK');
    }
  }, []);

  const login = (username: string, password: string) => submit('login', username, password);
  const register = (username: string, password: string) => submit('register', username, password);

  return {
    authToken,
    profile,
    error,
    busy,
    login,
    register,
    logout,
    refresh,
    shopError,
    buyCharacter: (id: string) => shop('purchase', id),
    equipCharacter: (id: string) => shop('equip', id),
  };
}
