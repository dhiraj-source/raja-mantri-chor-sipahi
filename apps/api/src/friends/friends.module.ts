import { Module } from '@nestjs/common';
import type { Pool } from 'pg';
import { AccountsModule } from '../accounts/accounts.module';
import { DatabaseModule, PG_POOL } from '../database/database.module';
import { FriendRepository, InMemoryFriendRepository } from './friend.repository';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { PgFriendRepository } from './pg-friend.repository';

@Module({
  imports: [DatabaseModule, AccountsModule],
  controllers: [FriendsController],
  providers: [
    {
      provide: FriendRepository,
      useFactory: (pool: Pool | null): FriendRepository =>
        pool ? new PgFriendRepository(pool) : new InMemoryFriendRepository(),
      inject: [PG_POOL],
    },
    FriendsService,
  ],
  exports: [FriendsService],
})
export class FriendsModule {}
