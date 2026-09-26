import { describe, expect, it } from 'vitest';
import { AccountsService, AuthError, ShopError } from '../src/accounts/accounts.service';
import { InMemoryAccountRepository, type AccountRecord } from '../src/accounts/account.repository';
import { AuthTokensService } from '../src/accounts/auth-tokens.service';
import { hashPassword, verifyPassword } from '../src/accounts/password';

function setup() {
  const tokens = new AuthTokensService();
  const repo = new InMemoryAccountRepository();
  return { tokens, repo, svc: new AccountsService(repo, tokens) };
}

async function expectAuthError(p: Promise<unknown>, code: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AuthError);
    expect((e as AuthError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

const win = { points: 2300, isWinner: true, rounds: 4, mantriCatches: 0, chorEscapes: 0 };

describe('password', () => {
  it('hash alag-alag salt se banta hai aur sahi password verify hota hai', async () => {
    const a = await hashPassword('correct horse');
    const b = await hashPassword('correct horse');
    expect(a).not.toBe(b);
    expect(a).not.toContain('correct horse');
    expect(await verifyPassword('correct horse', a)).toBe(true);
    expect(await verifyPassword('wrong', a)).toBe(false);
    expect(await verifyPassword('x', 'garbage')).toBe(false);
  });
});

describe('register / login', () => {
  it('register se account + token + khaali profile', async () => {
    const { svc } = setup();
    const res = await svc.register('  Asha_1 ', 'password123', 'Asha');
    expect(res.profile).toMatchObject({
      username: 'asha_1',
      displayName: 'Asha',
      xp: 0,
      level: 1,
      coins: 0,
      gamesPlayed: 0,
      achievements: [],
      history: [],
    });
    expect(svc.authenticate(res.authToken)).toBe(res.profile.accountId);
  });

  it('password profile/response me kahin nahi aata', async () => {
    const { svc } = setup();
    const res = await svc.register('asha', 'password123');
    expect(JSON.stringify(res)).not.toContain('password123');
    expect(JSON.stringify(res)).not.toContain('scrypt');
  });

  it('validation: username, password, duplicate', async () => {
    const { svc } = setup();
    await expectAuthError(svc.register('ab', 'password123'), 'INVALID_USERNAME');
    await expectAuthError(svc.register('has space', 'password123'), 'INVALID_USERNAME');
    await expectAuthError(svc.register(undefined, 'password123'), 'INVALID_USERNAME');
    await expectAuthError(svc.register('asha', 'short'), 'INVALID_PASSWORD');
    await expectAuthError(svc.register('asha', 'x'.repeat(73)), 'INVALID_PASSWORD');
    await expectAuthError(svc.register('asha', 12345678), 'INVALID_PASSWORD');
    await svc.register('asha', 'password123');
    await expectAuthError(svc.register('ASHA', 'password456'), 'USERNAME_TAKEN');
  });

  it('login sahi/galat', async () => {
    const { svc } = setup();
    await svc.register('asha', 'password123');
    const ok = await svc.login('Asha', 'password123');
    expect(ok.profile.username).toBe('asha');
    await expectAuthError(svc.login('asha', 'wrongpass'), 'BAD_CREDENTIALS');
    await expectAuthError(svc.login('nobody', 'password123'), 'BAD_CREDENTIALS');
    await expectAuthError(svc.login(undefined, undefined), 'BAD_CREDENTIALS');
  });

  it('login par rate limit (5 koshishen/minute/username)', async () => {
    const { svc } = setup();
    let t = 0;
    svc.now = () => t;
    await svc.register('asha', 'password123');
    for (let i = 0; i < 5; i++) await expectAuthError(svc.login('asha', 'bad-password'), 'BAD_CREDENTIALS');
    await expectAuthError(svc.login('asha', 'password123'), 'RATE_LIMITED');
    t = 60_000;
    expect((await svc.login('asha', 'password123')).profile.username).toBe('asha');
  });

  it('logout ke baad token kaam nahi karta', async () => {
    const { svc } = setup();
    const { authToken } = await svc.register('asha', 'password123');
    svc.logout(authToken);
    expect(svc.authenticate(authToken)).toBeNull();
    expect(svc.authenticate('garbage')).toBeNull();
    expect(svc.authenticate(undefined)).toBeNull();
  });
});

describe('auth token expiry', () => {
  it('7 din baad expire', () => {
    const tokens = new AuthTokensService();
    let t = 0;
    tokens.now = () => t;
    const token = tokens.issue('acc');
    t = 7 * 24 * 60 * 60 * 1000 - 1;
    expect(tokens.resolve(token)).toBe('acc');
    t += 1;
    expect(tokens.resolve(token)).toBeNull();
  });
});

async function expectShopError(p: Promise<unknown>, code: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(ShopError);
    expect((e as ShopError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe('shop: characters', () => {
  async function player() {
    const s = setup();
    const { profile } = await s.svc.register('asha', 'password123');
    return { ...s, id: profile.accountId };
  }

  it('naye account ke paas sirf DEFAULT, aur wahi pehna hua', async () => {
    const { svc, id } = await player();
    const p = await svc.getProfile(id);
    expect(p.ownedCharacters).toEqual(['DEFAULT']);
    expect(p.equippedCharacter).toBe('DEFAULT');
  });

  it('coins ke bina nahi; game jeetne ke baad CAT (10 coins) mil jata hai', async () => {
    const { svc, id } = await player();
    await expectShopError(svc.purchaseCharacter(id, 'CAT'), 'NOT_ENOUGH_COINS');
    await svc.recordGame(id, { roomCode: 'ABCD', summary: win }); // +30 coins, level 2
    const p = await svc.purchaseCharacter(id, 'CAT');
    expect(p.coins).toBe(20);
    expect(p.ownedCharacters).toEqual(['DEFAULT', 'CAT']);
  });

  it('galat khareedari reject: dobara, anjaan, DEFAULT, level kam, coins kam', async () => {
    const { svc, id } = await player();
    await svc.recordGame(id, { roomCode: 'ABCD', summary: win }); // 30 coins, level 2
    await svc.purchaseCharacter(id, 'CAT');
    await expectShopError(svc.purchaseCharacter(id, 'CAT'), 'ALREADY_OWNED');
    await expectShopError(svc.purchaseCharacter(id, 'DEFAULT'), 'ALREADY_OWNED');
    await expectShopError(svc.purchaseCharacter(id, 'NOPE'), 'UNKNOWN_ITEM');
    await expectShopError(svc.purchaseCharacter(id, undefined), 'UNKNOWN_ITEM');
    await expectShopError(svc.purchaseCharacter(id, { id: 'CAT' }), 'UNKNOWN_ITEM');
    await expectShopError(svc.purchaseCharacter(id, 'ROBOT'), 'LEVEL_TOO_LOW'); // level 3 chahiye
    await expectShopError(svc.purchaseCharacter(id, 'LION'), 'NOT_ENOUGH_COINS'); // 100 coins, paas 20
    expect((await svc.getProfile(id)).coins).toBe(20); // kisi galat khareed se coins nahi kate
  });

  it('level check coins se pehle hota hai (bahut coins ho tab bhi)', async () => {
    const { svc, id, repo } = await player();
    const account = await repo.findById(id);
    await repo.saveGameResult({ ...(account as AccountRecord), coins: 9999 }, {
      id: 'h', playedAt: 'x', roomCode: 'ABCD', points: 0, isWinner: false, xpGained: 0, coinsGained: 0,
    });
    await expectShopError(svc.purchaseCharacter(id, 'DRAGON'), 'LEVEL_TOO_LOW');
    expect((await svc.getProfile(id)).coins).toBe(9999);
  });

  it('equip: owned nahi to reject, owned ho to pehna jata hai aur callback chalta hai', async () => {
    const { svc, id } = await player();
    const changes: [string, string][] = [];
    svc.onCharacterChanged = (a, c) => changes.push([a, c]);
    await svc.recordGame(id, { roomCode: 'ABCD', summary: win });
    await expectShopError(svc.equipCharacter(id, 'CAT'), 'NOT_OWNED');
    await expectShopError(svc.equipCharacter(id, 'NOPE'), 'UNKNOWN_ITEM');
    expect(changes).toEqual([]);
    await svc.purchaseCharacter(id, 'CAT');
    expect((await svc.equipCharacter(id, 'CAT')).equippedCharacter).toBe('CAT');
    expect((await svc.equipCharacter(id, 'DEFAULT')).equippedCharacter).toBe('DEFAULT');
    expect(changes).toEqual([[id, 'CAT'], [id, 'DEFAULT']]);
  });

  it('reward aur khareedari ek saath aayein to coins sahi rehte hain', async () => {
    const { svc, id } = await player();
    await svc.recordGame(id, { roomCode: 'ABCD', summary: win }); // 30 coins
    await Promise.all([
      svc.recordGame(id, { roomCode: 'AAAA', summary: win }),
      svc.purchaseCharacter(id, 'CAT'),
      svc.recordGame(id, { roomCode: 'BBBB', summary: win }),
    ]);
    const p = await svc.getProfile(id);
    expect(p.coins).toBe(30 * 3 - 10);
    expect(p.gamesPlayed).toBe(3);
    expect(p.ownedCharacters).toContain('CAT');
  });
});

describe('recordGame', () => {
  it('XP, coins, wins, history aur achievements update hote hain', async () => {
    const { svc } = setup();
    const { profile } = await svc.register('asha', 'password123');
    const reward = await svc.recordGame(profile.accountId, { roomCode: 'ABCD', summary: win });
    expect(reward).toEqual({
      xpGained: 50 + 23 + 50,
      coinsGained: 30,
      level: 2,
      leveledUp: true,
      newAchievements: ['FIRST_GAME', 'FIRST_WIN'],
    });
    const after = await svc.getProfile(profile.accountId);
    expect(after).toMatchObject({ xp: 123, coins: 30, gamesPlayed: 1, wins: 1, level: 2 });
    expect(after.levelStartXp).toBe(100);
    expect(after.nextLevelXp).toBe(400);
    expect(after.history).toHaveLength(1);
    expect(after.history[0]).toMatchObject({ roomCode: 'ABCD', points: 2300, isWinner: true, xpGained: 123 });
  });

  it('achievements dobara nahi milte, history naya pehle', async () => {
    const { svc } = setup();
    const { profile } = await svc.register('asha', 'password123');
    await svc.recordGame(profile.accountId, { roomCode: 'AAAA', summary: win });
    const second = await svc.recordGame(profile.accountId, {
      roomCode: 'BBBB',
      summary: { ...win, isWinner: false, points: 0 },
    });
    expect(second?.newAchievements).toEqual([]);
    const p = await svc.getProfile(profile.accountId);
    expect(p.history.map((h) => h.roomCode)).toEqual(['BBBB', 'AAAA']);
    expect(p.gamesPlayed).toBe(2);
    expect(p.wins).toBe(1);
  });

  it('ek saath aaye games me koi update kho nahi jaata', async () => {
    const { svc } = setup();
    const { profile } = await svc.register('asha', 'password123');
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        svc.recordGame(profile.accountId, { roomCode: `R${i}`.padEnd(4, 'X'), summary: win }),
      ),
    );
    const p = await svc.getProfile(profile.accountId);
    expect(p.gamesPlayed).toBe(10);
    expect(p.wins).toBe(10);
    expect(p.xp).toBe(1230);
    expect(p.achievements).toContain('WIN_5');
  });

  it('history 10 tak', async () => {
    const { svc } = setup();
    const { profile } = await svc.register('asha', 'password123');
    for (let i = 0; i < 12; i++) {
      await svc.recordGame(profile.accountId, { roomCode: 'ROOM', summary: win });
    }
    expect((await svc.getProfile(profile.accountId)).history).toHaveLength(10);
  });

  it('anjaan account par null', async () => {
    const { svc } = setup();
    expect(await svc.recordGame('nope', { roomCode: 'ROOM', summary: win })).toBeNull();
  });
});
