import { Module } from '@nestjs/common';
import { FreezeTagService } from './freeze-tag.service';

/**
 * Baaki game modes ke modules se poori tarah independent. Socket wiring `RoomsGateway` me hai
 * (ek hi `/ws` connection saare game modes ko serve karta hai) — ye module sirf service export
 * karta hai.
 */
@Module({
  providers: [FreezeTagService],
  exports: [FreezeTagService],
})
export class FreezeTagModule {}
