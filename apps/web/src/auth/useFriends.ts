import { useCallback, useEffect, useState } from 'react';
import type { FriendsOverview } from '@rmc/shared-types';
import { ApiError, friendsApi, type FriendUiError } from './authApi';

const EMPTY: FriendsOverview = { friends: [], incoming: [], outgoing: [] };

/**
 * Friends list server se. `version` badalte hi (server ka FRIENDS_CHANGED) dobara fetch hoti hai,
 * isliye request/accept/online-offline live dikhte hain.
 */
export function useFriends(authToken: string | null, version: number) {
  const [overview, setOverview] = useState<FriendsOverview>(EMPTY);
  const [error, setError] = useState<FriendUiError | null>(null);

  const refresh = useCallback(async () => {
    if (!authToken) {
      setOverview(EMPTY);
      return;
    }
    try {
      setOverview(await friendsApi.overview(authToken));
    } catch {
      // Network error par purani list dikhti rahe.
    }
  }, [authToken]);

  useEffect(() => {
    void refresh();
  }, [refresh, version]);

  /** Koi action chalao; error ho to code dikhao, warna list taaza karo. */
  const run = useCallback(
    async (action: (token: string) => Promise<unknown>): Promise<boolean> => {
      if (!authToken) return false;
      setError(null);
      try {
        await action(authToken);
        await refresh();
        return true;
      } catch (e) {
        setError(e instanceof ApiError ? (e.code as FriendUiError) : 'NETWORK');
        return false;
      }
    },
    [authToken, refresh],
  );

  return {
    overview,
    error,
    clearError: () => setError(null),
    addFriend: (username: string) => run((t) => friendsApi.request(t, username.trim())),
    accept: (accountId: string) => run((t) => friendsApi.accept(t, accountId)),
    decline: (accountId: string) => run((t) => friendsApi.decline(t, accountId)),
    unfriend: (accountId: string) => run((t) => friendsApi.unfriend(t, accountId)),
  };
}
