import { Module } from '@nestjs/common';
import { AccountsModule } from '../accounts/accounts.module';
import { BombTagModule } from '../bomb-tag/bomb-tag.module';
import { DrawGuessModule } from '../draw-guess/draw-guess.module';
import { FriendsModule } from '../friends/friends.module';
import { MatchmakingService } from './matchmaking.service';
import { RoomsGateway } from './rooms.gateway';
import { RoomsService } from './rooms.service';
import { SessionsService } from './sessions.service';

@Module({
  imports: [AccountsModule, FriendsModule, DrawGuessModule, BombTagModule],
  providers: [RoomsService, SessionsService, MatchmakingService, RoomsGateway],
})
export class RoomsModule {}
