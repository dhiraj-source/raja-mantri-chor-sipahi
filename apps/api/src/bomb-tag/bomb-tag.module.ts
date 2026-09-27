import { Module } from '@nestjs/common';
import { BombTagService } from './bomb-tag.service';

/**
 * RMCS/Draw & Guess ke modules se poori tarah independent. Socket wiring `RoomsGateway` me hai
 * (ek hi `/ws` connection teeno game modes ko serve karta hai) — ye module sirf service export
 * karta hai.
 */
@Module({
  providers: [BombTagService],
  exports: [BombTagService],
})
export class BombTagModule {}
