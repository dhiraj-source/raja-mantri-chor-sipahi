import { Body, Controller, Delete, Get, Headers, HttpCode, HttpException, Param, Post } from '@nestjs/common';
import type { FriendErrorCode, FriendsOverview } from '@rmc/shared-types';
import { AccountsService } from '../accounts/accounts.service';
import { FriendError, FriendsService } from './friends.service';

const STATUS: Record<FriendErrorCode, number> = {
  FRIEND_NOT_FOUND: 404,
  FRIEND_SELF: 400,
  ALREADY_FRIENDS: 409,
  ALREADY_REQUESTED: 409,
  REQUEST_LIMIT: 429,
  UNAUTHORIZED: 401,
};

/** Bearer token se accountId; warna 401. */
function requireAccount(accounts: AccountsService, header: string | undefined): string {
  const token = /^Bearer (.+)$/.exec(header ?? '')?.[1];
  const accountId = accounts.authenticate(token ?? null);
  if (!accountId) throw new FriendError('UNAUTHORIZED', 'Pehle login karo.');
  return accountId;
}

async function toHttp<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof FriendError) throw new HttpException({ code: e.code, message: e.message }, STATUS[e.code]);
    throw e;
  }
}

@Controller('friends')
export class FriendsController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly friends: FriendsService,
  ) {}

  @Get()
  overview(@Headers('authorization') auth?: string): Promise<FriendsOverview> {
    return toHttp(async () => this.friends.overview(requireAccount(this.accounts, auth)));
  }

  @Post('requests')
  @HttpCode(200)
  request(
    @Headers('authorization') auth: string | undefined,
    @Body() body: { username?: unknown },
  ): Promise<{ result: 'REQUESTED' | 'ACCEPTED' }> {
    return toHttp(async () => ({
      result: await this.friends.sendRequest(requireAccount(this.accounts, auth), body?.username),
    }));
  }

  @Post('requests/:accountId/accept')
  @HttpCode(204)
  accept(@Headers('authorization') auth: string | undefined, @Param('accountId') accountId: string): Promise<void> {
    return toHttp(() => this.friends.accept(requireAccount(this.accounts, auth), accountId));
  }

  @Delete('requests/:accountId')
  @HttpCode(204)
  decline(@Headers('authorization') auth: string | undefined, @Param('accountId') accountId: string): Promise<void> {
    return toHttp(() => this.friends.decline(requireAccount(this.accounts, auth), accountId));
  }

  @Delete(':accountId')
  @HttpCode(204)
  unfriend(@Headers('authorization') auth: string | undefined, @Param('accountId') accountId: string): Promise<void> {
    return toHttp(() => this.friends.unfriend(requireAccount(this.accounts, auth), accountId));
  }
}
