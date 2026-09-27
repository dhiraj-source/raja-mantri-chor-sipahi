import { clampMagnitude, clampToArena, type Vec2 } from './geometry';

/**
 * Ek movement step: input direction (kabhi bhi length 1 se zyada nahi hona chahiye — client se
 * aaya kuch bhi ho, yahan clamp hota hai) ke hisaab se position aage badhata hai, phir arena ke
 * andar rakhta hai. `dtMs` = is step me kitna waqt guzra (server tick interval).
 */
export function stepPosition(
  pos: Vec2,
  direction: Vec2,
  speed: number,
  dtMs: number,
  radius: number,
  arenaWidth: number,
  arenaHeight: number,
): Vec2 {
  const safeDir = clampMagnitude(direction, 1);
  const dtSec = dtMs / 1000;
  const next = {
    x: pos.x + safeDir.x * speed * dtSec,
    y: pos.y + safeDir.y * speed * dtSec,
  };
  return clampToArena(next, radius, arenaWidth, arenaHeight);
}
