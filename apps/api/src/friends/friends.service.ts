import { Injectable } from '@nestjs/common';
import {
  MAX_PENDING_OUTGOING_REQUESTS,
  type FriendErrorCode,
  type FriendInfo,
  type FriendsOverview,
} from '@rmc/shared-types';
import { AccountRepository } from '../accounts/account.repository';
import { FriendRepository, type Friendship } from './friend.repository';

export class FriendError extends Error {
  constructor(
    public readonly code: FriendErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'FriendError';
  }
}

/**
 * Dosti ke rules. Online status aur "kaun badla" ki khabar gateway se judti hai
 * (isOnline / onChange), taaki yahan WebSocket ka kuch na ho.
 */
@Injectable()
export class FriendsService {
  /** Gateway set karta hai: account abhi connected hai ya nahi. */
  isOnline: (accountId: string) => boolean = () => false;
  /** Gateway set karta hai: in accounts ki friends list badli hai (live refresh ke liye). */
  onChange: ((accountIds: string[]) => void) | null = null;
  /** Tests me fixed time dene ke liye. */
  now: () => number = Date.now;

  constructor(
    private readonly friends: FriendRepository,
    private readonly accounts: AccountRepository,
  ) {}

  /**
   * Username se request. Agar samne wale ne pehle se mujhe request bheji hui thi to seedha dosti ho jaati hai.
   * Return: 'REQUESTED' ya 'ACCEPTED'.
   */
  async sendRequest(me: string, rawUsername: unknown): Promise<'REQUESTED' | 'ACCEPTED'> {
    const username = typeof rawUsername === 'string' ? rawUsername.trim().toLowerCase() : '';
    const target = username ? await this.accounts.findByUsername(username) : null;
    if (!target) throw new FriendError('FRIEND_NOT_FOUND', 'Ye username nahi mila.');
    if (target.id === me) throw new FriendError('FRIEND_SELF', 'Aap khud ko friend nahi bana sakte.');

    const existing = await this.friends.find(me, target.id);
    if (existing?.status === 'ACCEPTED') throw new FriendError('ALREADY_FRIENDS', 'Aap pehle se dost ho.');
    if (existing) {
      if (existing.requestedBy === me) throw new FriendError('ALREADY_REQUESTED', 'Request pehle se bheji hui hai.');
      await this.friends.accept(me, target.id); // unhone pehle bheji thi: dono chahte hain
      this.onChange?.([me, target.id]);
      return 'ACCEPTED';
    }

    const outgoing = (await this.friends.listFor(me)).filter((f) => f.status === 'PENDING' && f.requestedBy === me);
    if (outgoing.length >= MAX_PENDING_OUTGOING_REQUESTS) {
      throw new FriendError('REQUEST_LIMIT', 'Bahut zyada pending requests.');
    }
    const created = await this.friends.create(me, target.id, me, new Date(this.now()).toISOString());
    if (!created) throw new FriendError('ALREADY_REQUESTED', 'Request pehle se bheji hui hai.');
    this.onChange?.([me, target.id]);
    return 'REQUESTED';
  }

  /** Mujhe aayi request accept karo. */
  async accept(me: string, requesterId: string): Promise<void> {
    const row = await this.friends.find(me, requesterId);
    if (!row || row.status !== 'PENDING' || row.requestedBy !== requesterId) {
      throw new FriendError('FRIEND_NOT_FOUND', 'Ye request nahi mili.');
    }
    if (!(await this.friends.accept(me, requesterId))) {
      throw new FriendError('FRIEND_NOT_FOUND', 'Ye request nahi mili.');
    }
    this.onChange?.([me, requesterId]);
  }

  /** Pending request hatao: aayi hui ho to decline, meri bheji ho to cancel. */
  async decline(me: string, otherId: string): Promise<void> {
    const row = await this.friends.find(me, otherId);
    if (!row || row.status !== 'PENDING' || !(await this.friends.remove(me, otherId))) {
      throw new FriendError('FRIEND_NOT_FOUND', 'Ye request nahi mili.');
    }
    this.onChange?.([me, otherId]);
  }

  async unfriend(me: string, otherId: string): Promise<void> {
    const row = await this.friends.find(me, otherId);
    if (!row || row.status !== 'ACCEPTED' || !(await this.friends.remove(me, otherId))) {
      throw new FriendError('FRIEND_NOT_FOUND', 'Ye dost nahi mila.');
    }
    this.onChange?.([me, otherId]);
  }

  async areFriends(x: string, y: string): Promise<boolean> {
    return (await this.friends.find(x, y))?.status === 'ACCEPTED';
  }

  /** Mere accepted dosto ke account ids. */
  async friendIdsOf(me: string): Promise<string[]> {
    return (await this.friends.listFor(me)).filter((f) => f.status === 'ACCEPTED').map((f) => other(f, me));
  }

  async displayNameOf(accountId: string): Promise<string | null> {
    return (await this.accounts.findById(accountId))?.displayName ?? null;
  }

  async overview(me: string): Promise<FriendsOverview> {
    const rows = await this.friends.listFor(me);
    const info = async (row: Friendship): Promise<FriendInfo | null> => {
      const id = other(row, me);
      const account = await this.accounts.findById(id);
      return account
        ? { accountId: id, username: account.username, displayName: account.displayName, online: this.isOnline(id) }
        : null;
    };
    const build = async (rs: Friendship[]): Promise<FriendInfo[]> =>
      (await Promise.all(rs.map(info))).filter((f): f is FriendInfo => f !== null);
    const byName = (a: FriendInfo, b: FriendInfo) =>
      Number(b.online) - Number(a.online) || a.displayName.localeCompare(b.displayName);

    return {
      friends: (await build(rows.filter((r) => r.status === 'ACCEPTED'))).sort(byName),
      incoming: await build(rows.filter((r) => r.status === 'PENDING' && r.requestedBy !== me)),
      outgoing: await build(rows.filter((r) => r.status === 'PENDING' && r.requestedBy === me)),
    };
  }
}

const other = (row: Friendship, me: string): string => (row.a === me ? row.b : row.a);
