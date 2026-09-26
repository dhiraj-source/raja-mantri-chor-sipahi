import { Body, Controller, Headers, HttpCode, HttpException, Post } from '@nestjs/common';
import type { Profile, ShopErrorCode } from '@rmc/shared-types';
import { AccountsService, ShopError } from './accounts.service';

const STATUS: Record<ShopErrorCode, number> = {
  UNKNOWN_ITEM: 404,
  ALREADY_OWNED: 409,
  NOT_OWNED: 403,
  NOT_ENOUGH_COINS: 402,
  LEVEL_TOO_LOW: 403,
  UNAUTHORIZED: 401,
};

/** Shop ke kaam: hamesha login chahiye; nateeja poora naya Profile. */
@Controller('shop')
export class ShopController {
  constructor(private readonly accounts: AccountsService) {}

  @Post('purchase')
  @HttpCode(200)
  purchase(@Headers('authorization') auth: string | undefined, @Body() body: { characterId?: unknown }): Promise<Profile> {
    return this.run(auth, (accountId) => this.accounts.purchaseCharacter(accountId, body?.characterId));
  }

  @Post('equip')
  @HttpCode(200)
  equip(@Headers('authorization') auth: string | undefined, @Body() body: { characterId?: unknown }): Promise<Profile> {
    return this.run(auth, (accountId) => this.accounts.equipCharacter(accountId, body?.characterId));
  }

  private async run(auth: string | undefined, work: (accountId: string) => Promise<Profile>): Promise<Profile> {
    try {
      const token = /^Bearer (.+)$/.exec(auth ?? '')?.[1];
      const accountId = this.accounts.authenticate(token ?? null);
      if (!accountId) throw new ShopError('UNAUTHORIZED', 'Pehle login karo.');
      return await work(accountId);
    } catch (e) {
      if (e instanceof ShopError) throw new HttpException({ code: e.code, message: e.message }, STATUS[e.code]);
      throw e;
    }
  }
}
