import { useEffect, useRef } from 'react';
import type { BombTagGameView, BombTagRoomPlayerView, PlayerId } from '@rmc/shared-types';

interface Props {
  game: BombTagGameView;
  roster: readonly BombTagRoomPlayerView[];
  myId: PlayerId | null;
}

const BG = '#1c1917';

/**
 * Arena canvas: server ke `BombTagGameView` (position/bomb/alive) ko roster (naam/rang, alag se
 * bheja jaata hai — tick rate par dobara nahi) ke saath render karta hai. Draw & Guess ke `Canvas`
 * jaisa fixed internal resolution (server ke arenaWidth/Height se), CSS se scale hota hai — par
 * ye drawing tool nahi hai, sirf poore game-view ko har naye snapshot par dobara draw karta hai
 * (~20fps, itne players ke liye kaafi sasta hai — interpolation/smoothing baad ke polish ke liye).
 */
export function Arena({ game, roster, myId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { arenaWidth: w, arenaHeight: h, playerRadius: r } = game;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, w, h);

    for (const p of game.players) {
      const info = roster.find((rp) => rp.id === p.id);
      const color = info?.color ?? '#78716c';
      const isBombHolder = p.id === game.bombHolderId;

      ctx.globalAlpha = p.alive ? 1 : 0.25;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      if (p.id === myId) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      }
      if (isBombHolder && p.alive) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (isBombHolder && p.alive) {
        ctx.font = `${Math.round(r * 1.4)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('💣', p.x, p.y - r - 10);
      }

      ctx.fillStyle = p.alive ? '#e7e5e4' : '#78716c';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(info?.name ?? '?', p.x, p.y + r + 6);
    }
  }, [game, roster, myId]);

  return (
    <canvas
      ref={canvasRef}
      width={game.arenaWidth}
      height={game.arenaHeight}
      role="img"
      aria-label="Bomb Tag arena"
      className="w-full rounded-xl bg-stone-900"
      style={{ aspectRatio: `${game.arenaWidth} / ${game.arenaHeight}` }}
    />
  );
}
