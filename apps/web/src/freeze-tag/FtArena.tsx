import { useEffect, useRef } from 'react';
import type { FreezeTagGameView, FreezeTagRoomPlayerView, PlayerId } from '@rmc/shared-types';

interface Props {
  game: FreezeTagGameView;
  roster: readonly FreezeTagRoomPlayerView[];
  myId: PlayerId | null;
}

const BG = '#0f172a';
const ICE = '#7dd3fc';

/**
 * Freeze Tag arena. Server ke snapshot (20Hz) se render hota hai, par draw ek
 * requestAnimationFrame loop me hota hai taaki IT ka pulse/chamak 60fps smooth rahe — bilkul
 * Bomb Tag ke arena jaisa pattern.
 */
export function FtArena({ game, roster, myId }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const latest = useRef({ game, roster, myId });
  latest.current = { game, roster, myId };

  useEffect(() => {
    let frame = 0;
    const draw = (): void => {
      frame = requestAnimationFrame(draw);
      const { game, roster, myId } = latest.current;
      const ctx = canvasRef.current?.getContext('2d');
      if (!ctx) return;
      const { arenaWidth: w, arenaHeight: h, playerRadius: r } = game;
      const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 180);

      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, w, h);

      // Halka grid — arena ki boundary aur doori samajhne me madad karta hai.
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
      ctx.lineWidth = 1;
      for (let x = 100; x < w; x += 100) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 100; y < h; y += 100) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // IT ke aas-paas khatre ka glow (sabko dikhta hai ki kitna paas jaana risky hai).
      const it = game.players.find((p) => p.id === game.itId);
      if (it && game.phase === 'PLAYING') {
        const glow = r * 3 * (0.85 + 0.15 * pulse);
        const gradient = ctx.createRadialGradient(it.x, it.y, r, it.x, it.y, glow);
        gradient.addColorStop(0, `rgba(239, 68, 68, ${0.25 + 0.1 * pulse})`);
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(it.x, it.y, glow, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const p of game.players) {
        const info = roster.find((rp) => rp.id === p.id);
        const color = info?.color ?? '#94a3b8';
        const frozen = p.status === 'FROZEN';
        const isIt = p.status === 'IT';

        // Frozen player: neeli barf ki tarah, halka feeka.
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = frozen ? ICE : color;
        ctx.globalAlpha = frozen ? 0.75 : 1;
        ctx.fill();
        ctx.globalAlpha = 1;

        if (frozen) {
          // Barf ki daraarein.
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 2;
          for (let i = 0; i < 3; i++) {
            const angle = (Math.PI * 2 * i) / 3;
            ctx.beginPath();
            ctx.moveTo(p.x - Math.cos(angle) * r, p.y - Math.sin(angle) * r);
            ctx.lineTo(p.x + Math.cos(angle) * r, p.y + Math.sin(angle) * r);
            ctx.stroke();
          }
        }

        if (isIt) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = `rgba(248, 113, 113, ${0.6 + 0.4 * pulse})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Main kaun hoon — safed ring.
        if (p.id === myId) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Sar ke upar marker.
        if (isIt || frozen) {
          ctx.font = `${Math.round(r * 1.3)}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(isIt ? '🔴' : '❄️', p.x, p.y - r - 12);
        }

        ctx.fillStyle = frozen ? '#bae6fd' : '#e2e8f0';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(info?.name ?? '?', p.x, p.y + r + 6);
      }
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={game.arenaWidth}
      height={game.arenaHeight}
      role="img"
      aria-label="Freeze Tag arena"
      className="w-full rounded-xl bg-slate-900"
      style={{ aspectRatio: `${game.arenaWidth} / ${game.arenaHeight}` }}
    />
  );
}
