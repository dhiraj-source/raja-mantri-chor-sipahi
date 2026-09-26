import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { DatabaseModule, PG_POOL } from '../database/database.module';
import { AccountRepository, InMemoryAccountRepository } from './account.repository';
import { AccountsService } from './accounts.service';
import { AuthController } from './auth.controller';
import { AuthTokensService } from './auth-tokens.service';
import { PgAccountRepository } from './pg-account.repository';
import { ShopController } from './shop.controller';

/** Pool hai => PostgreSQL, nahi => in-memory. Service code dono me same hai. */
export const accountRepositoryProvider = {
  provide: AccountRepository,
  useFactory: (pool: Pool | null): AccountRepository =>
    pool ? new PgAccountRepository(pool) : new InMemoryAccountRepository(),
  inject: [PG_POOL],
};

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, ShopController],
  providers: [accountRepositoryProvider, AuthTokensService, AccountsService],
  exports: [AccountsService, AccountRepository],
})
export class AccountsModule {}
