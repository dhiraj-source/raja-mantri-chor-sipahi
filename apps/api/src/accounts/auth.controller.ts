import { Body, Controller, Get, Headers, HttpCode, HttpException, Post } from '@nestjs/common';
import type { AuthErrorCode, AuthResponse, Profile } from '@rmc/shared-types';
import { AccountsService, AuthError } from './accounts.service';

const STATUS: Record<AuthErrorCode, number> = {
  INVALID_USERNAME: 400,
  INVALID_PASSWORD: 400,
  USERNAME_TAKEN: 409,
  BAD_CREDENTIALS: 401,
  UNAUTHORIZED: 401,
  RATE_LIMITED: 429,
};

function bearer(header: string | undefined): string | null {
  const match = /^Bearer (.+)$/.exec(header ?? '');
  return match?.[1] ?? null;
}

/** AuthError ko { code, message } JSON + sahi HTTP status me badalta hai. */
async function toHttp<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (e) {
    if (e instanceof AuthError) {
      throw new HttpException({ code: e.code, message: e.message }, STATUS[e.code]);
    }
    throw e;
  }
}

@Controller()
export class AuthController {
  constructor(private readonly accounts: AccountsService) {}

  @Post('auth/register')
  register(
    @Body() body: { username?: unknown; password?: unknown; displayName?: unknown },
  ): Promise<AuthResponse> {
    return toHttp(() => this.accounts.register(body?.username, body?.password, body?.displayName));
  }

  @Post('auth/login')
  @HttpCode(200)
  login(@Body() body: { username?: unknown; password?: unknown }): Promise<AuthResponse> {
    return toHttp(() => this.accounts.login(body?.username, body?.password));
  }

  @Post('auth/logout')
  @HttpCode(204)
  logout(@Headers('authorization') authorization?: string): void {
    const token = bearer(authorization);
    if (token) this.accounts.logout(token);
  }

  @Get('me')
  me(@Headers('authorization') authorization?: string): Promise<Profile> {
    return toHttp(async () => {
      const accountId = this.accounts.authenticate(bearer(authorization));
      if (!accountId) throw new AuthError('UNAUTHORIZED', 'Pehle login karo.');
      return this.accounts.getProfile(accountId);
    });
  }
}
