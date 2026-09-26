import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryAccountRepository, type AccountRecord } from '../src/accounts/account.repository';
import { PgAccountRepository } from '../src/accounts/pg-account.repository';
import { runMigrations } from '../src/database/migrate';
import { InMemoryFriendRepository, orderedPair, type FriendRepository } from '../src/friends/friend.repository';
import { FriendError, FriendsService } from '../src/friends/friends.service';
import { PgFriendRepository } from '../src/friends/pg-friend.repository';

// ---- PostgreSQL mile to PG tests chalte hain ----
const url = process.env.DATABASE_URL;
let pool: Pool | null = null;
if (url) {
  const candidate = new Pool({ connectionString: url });
  try {
    await candidate.query('SELECT 1');
    pool = candidate;
  } catch {
    await candidate.end().catch(() => undefined);
  }
}
const runId = randomUUID().slice(0, 8);

const account = (username: string): AccountRecord => ({
  id: randomUUID(),
  username,
  displayName: username.toUpperCase(),
  passwordHash: 'x',
  createdAt: new Date().toISOString(),
  xp: 0,
  coins: 0,
  gamesPlayed: 0,
  wins: 0,
  achievements: [],
  equippedCharacter: 'DEFAULT',
});

const T = '2026-01-01T00:00:00.000Z';

/** Dono implementations ek jaisa behave karein. `newId` ek naya (valid) account id deta hai. */
function repositoryContract(name: string, getRepo: () => FriendRepository, newId: () => Promise<string>): void {
  describe(`FriendRepository contract: ${name}`, () => {
    it('create: pehli baar true, (y,x) ya (x,y) dobara false', async () => {
      const repo = getRepo();
      const [x, y] = [await newId(), await newId()];
      expect(await repo.create(x, y, x, T)).toBe(true);
      expect(await repo.create(x, y, x, T)).toBe(false);
      expect(await repo.create(y, x, y, T)).toBe(false);
    });

    it('find dono order me ek hi row deta hai', async () => {
      const repo = getRepo();
      const [x, y] = [await newId(), await newId()];
      await repo.create(x, y, y, T);
      const [a, b] = orderedPair(x, y);
      expect(await repo.find(x, y)).toEqual({ a, b, requestedBy: y, status: 'PENDING', createdAt: T });
      expect(await repo.find(y, x)).toEqual(await repo.find(x, y));
      expect(await repo.find(x, await newId())).toBeNull();
      expect(await repo.find('not-a-uuid', y)).toBeNull();
    });

    it('accept sirf PENDING ko ACCEPTED banata hai', async () => {
      const repo = getRepo();
      const [x, y] = [await newId(), await newId()];
      expect(await repo.accept(x, y)).toBe(false); // row hi nahi
      await repo.create(x, y, x, T);
      expect(await repo.accept(y, x)).toBe(true);
      expect((await repo.find(x, y))?.status).toBe('ACCEPTED');
      expect(await repo.accept(x, y)).toBe(false); // pehle se accepted
    });

    it('remove: hatata hai, dobara false', async () => {
      const repo = getRepo();
      const [x, y] = [await newId(), await newId()];
      await repo.create(x, y, x, T);
      expect(await repo.remove(y, x)).toBe(true);
      expect(await repo.remove(x, y)).toBe(false);
      expect(await repo.find(x, y)).toBeNull();
    });

    it('listFor: sirf us account ki rows, dono taraf ki', async () => {
      const repo = getRepo();
      const [me, p, q, other1, other2] = [await newId(), await newId(), await newId(), await newId(), await newId()];
      await repo.create(me, p, me, T);
      await repo.create(q, me, q, T);
      await repo.create(other1, other2, other1, T);
      const rows = await repo.listFor(me);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.a === me || r.b === me)).toBe(true);
      expect(await repo.listFor('not-a-uuid')).toEqual([]);
    });
  });
}

repositoryContract('in-memory', () => new InMemoryFriendRepository(), async () => randomUUID());

describe.skipIf(!pool)('PostgreSQL friendships', () => {
  const db = pool as Pool;
  const accounts = () => new PgAccountRepository(db);
  const created: string[] = [];

  beforeAll(async () => {
    await runMigrations(db);
  });

  afterAll(async () => {
    await db.query('DELETE FROM accounts WHERE username LIKE $1', [`f\\_${runId}\\_%`]);
    await db.end();
  });

  const newId = async () => {
    const a = account(`f_${runId}_${created.length}_${randomUUID().slice(0, 4)}`);
    created.push(a.id);
    await accounts().create(a);
    return a.id;
  };

  repositoryContract('PostgreSQL', () => new PgFriendRepository(db), newId);

  it('database rules: khud se dosti, galat requested_by aur galat order reject', async () => {
    const [x, y] = [await newId(), await newId()];
    const [low, high] = orderedPair(x, y);
    const insert = (l: string, h: string, by: string) =>
      db.query(
        `INSERT INTO friendships (account_low, account_high, requested_by, status, created_at) VALUES ($1,$2,$3,'PENDING',now())`,
        [l, h, by],
      );
    await expect(insert(low, low, low)).rejects.toThrow(); // low < high
    await expect(insert(high, low, high)).rejects.toThrow(); // ulta order
    await expect(insert(low, high, randomUUID())).rejects.toThrow(); // requested_by pair me nahi
    await expect(db.query(`INSERT INTO friendships VALUES ($1,$2,$1,'MAYBE',now())`, [low, high])).rejects.toThrow();
  });

  it('account delete hone par uski dostiyan bhi hat jaati hain (cascade)', async () => {
    const [x, y] = [await newId(), await newId()];
    const repo = new PgFriendRepository(db);
    await repo.create(x, y, x, T);
    await db.query('DELETE FROM accounts WHERE id = $1', [x]);
    expect(await repo.find(x, y)).toBeNull();
    expect(await repo.listFor(y)).toEqual([]);
  });

  it('do ek saath aayi create me sirf ek jeetta hai', async () => {
    const [x, y] = [await newId(), await newId()];
    const repo = new PgFriendRepository(db);
    const results = await Promise.all(Array.from({ length: 5 }, () => repo.create(x, y, x, T)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------

async function setup() {
  const accounts = new InMemoryAccountRepository();
  const friends = new InMemoryFriendRepository();
  const svc = new FriendsService(friends, accounts);
  const make = async (username: string) => {
    const a = account(username);
    await accounts.create(a);
    return a.id;
  };
  const [asha, bina, charu] = [await make('asha'), await make('bina'), await make('charu')];
  return { svc, asha, bina, charu };
}

async function expectFriendError(p: Promise<unknown>, code: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(FriendError);
    expect((e as FriendError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe('FriendsService', () => {
  it('request -> accept -> dono ki list me dost', async () => {
    const { svc, asha, bina } = await setup();
    expect(await svc.sendRequest(asha, ' Bina ')).toBe('REQUESTED');

    let a = await svc.overview(asha);
    let b = await svc.overview(bina);
    expect(a.outgoing.map((f) => f.username)).toEqual(['bina']);
    expect(b.incoming.map((f) => f.username)).toEqual(['asha']);
    expect(a.friends).toEqual([]);

    await svc.accept(bina, asha);
    a = await svc.overview(asha);
    b = await svc.overview(bina);
    expect(a.friends.map((f) => f.username)).toEqual(['bina']);
    expect(b.friends.map((f) => f.username)).toEqual(['asha']);
    expect(a.outgoing).toEqual([]);
    expect(b.incoming).toEqual([]);
    expect(await svc.areFriends(asha, bina)).toBe(true);
    expect(await svc.friendIdsOf(asha)).toEqual([bina]);
  });

  it('galat request: anjaan username, khud, dobara, pehle se dost', async () => {
    const { svc, asha, bina } = await setup();
    await expectFriendError(svc.sendRequest(asha, 'nobody'), 'FRIEND_NOT_FOUND');
    await expectFriendError(svc.sendRequest(asha, undefined), 'FRIEND_NOT_FOUND');
    await expectFriendError(svc.sendRequest(asha, 'ASHA'), 'FRIEND_SELF');
    await svc.sendRequest(asha, 'bina');
    await expectFriendError(svc.sendRequest(asha, 'bina'), 'ALREADY_REQUESTED');
    await svc.accept(bina, asha);
    await expectFriendError(svc.sendRequest(asha, 'bina'), 'ALREADY_FRIENDS');
    await expectFriendError(svc.sendRequest(bina, 'asha'), 'ALREADY_FRIENDS');
  });

  it('dono ne ek doosre ko request bheji => seedha dosti', async () => {
    const { svc, asha, bina } = await setup();
    await svc.sendRequest(asha, 'bina');
    expect(await svc.sendRequest(bina, 'asha')).toBe('ACCEPTED');
    expect(await svc.areFriends(asha, bina)).toBe(true);
  });

  it('accept sirf samne wale ki bheji request par; apni bheji request khud accept nahi', async () => {
    const { svc, asha, bina, charu } = await setup();
    await svc.sendRequest(asha, 'bina');
    await expectFriendError(svc.accept(asha, bina), 'FRIEND_NOT_FOUND'); // asha ne khud bheji thi
    await expectFriendError(svc.accept(charu, asha), 'FRIEND_NOT_FOUND'); // charu ko request nahi
    await expectFriendError(svc.accept(bina, charu), 'FRIEND_NOT_FOUND');
    await svc.accept(bina, asha);
    await expectFriendError(svc.accept(bina, asha), 'FRIEND_NOT_FOUND'); // pehle se accepted
  });

  it('decline (aayi hui) aur cancel (bheji hui) dono se request hat jaati hai', async () => {
    const { svc, asha, bina, charu } = await setup();
    await svc.sendRequest(asha, 'bina');
    await svc.decline(bina, asha);
    expect((await svc.overview(asha)).outgoing).toEqual([]);
    await svc.sendRequest(asha, 'charu');
    await svc.decline(asha, charu); // cancel
    expect((await svc.overview(charu)).incoming).toEqual([]);
    await expectFriendError(svc.decline(asha, charu), 'FRIEND_NOT_FOUND');
  });

  it('decline accepted dosti ko nahi hatata; unfriend hatata hai', async () => {
    const { svc, asha, bina } = await setup();
    await svc.sendRequest(asha, 'bina');
    await svc.accept(bina, asha);
    await expectFriendError(svc.decline(asha, bina), 'FRIEND_NOT_FOUND');
    expect(await svc.areFriends(asha, bina)).toBe(true);
    await svc.unfriend(bina, asha);
    expect(await svc.areFriends(asha, bina)).toBe(false);
    await expectFriendError(svc.unfriend(bina, asha), 'FRIEND_NOT_FOUND');
    await svc.sendRequest(asha, 'bina'); // dobara dost bana sakte hain
  });

  it('online status dikhta hai aur online dost pehle', async () => {
    const { svc, asha, bina, charu } = await setup();
    for (const [me, other, name] of [[asha, bina, 'bina'], [asha, charu, 'charu']] as const) {
      await svc.sendRequest(asha, name);
      await svc.accept(other, me);
    }
    svc.isOnline = (id) => id === charu;
    const { friends } = await svc.overview(asha);
    expect(friends.map((f) => [f.username, f.online])).toEqual([['charu', true], ['bina', false]]);
  });

  it('onChange dono accounts ke saath call hota hai', async () => {
    const { svc, asha, bina } = await setup();
    const calls: string[][] = [];
    svc.onChange = (ids) => calls.push([...ids].sort());
    await svc.sendRequest(asha, 'bina');
    await svc.accept(bina, asha);
    await svc.unfriend(asha, bina);
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => c.includes(asha) && c.includes(bina))).toBe(true);
  });

  it('pending requests ki limit', async () => {
    const accounts = new InMemoryAccountRepository();
    const svc = new FriendsService(new InMemoryFriendRepository(), accounts);
    const me = account('me');
    await accounts.create(me);
    for (let i = 0; i < 21; i++) await accounts.create(account(`user${i}`));
    for (let i = 0; i < 20; i++) await svc.sendRequest(me.id, `user${i}`);
    await expectFriendError(svc.sendRequest(me.id, 'user20'), 'REQUEST_LIMIT');
  });
});
