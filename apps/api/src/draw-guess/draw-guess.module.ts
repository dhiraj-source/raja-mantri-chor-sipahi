import { Module } from '@nestjs/common';
import { DrawGuessService } from './draw-guess.service';

/**
 * RMCS ka RoomsModule alag hai; ye poori tarah independent module hai. Socket wiring
 * `RoomsGateway` me hai (ek hi `/ws` connection dono game modes ko serve karta hai — do alag
 * realtime stack banane ke bajaye), isliye ye module sirf service export karta hai.
 */
@Module({
  providers: [DrawGuessService],
  exports: [DrawGuessService],
})
export class DrawGuessModule {}
