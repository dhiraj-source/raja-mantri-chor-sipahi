import { useRef, useState } from 'react';

interface Props {
  onChange: (x: number, y: number) => void;
}

const BASE_SIZE = 120;
const RADIUS = BASE_SIZE / 2;
/**
 * Network par input bhejne ki speed. Server apna simulation 20Hz (har 50ms) par chalata hai aur
 * har tick par sirf aakhri input padhta hai — isliye har `pointermove` (60-120/sec) par bhejna
 * bilkul bekaar tha, aur itne messages gateway ki flood-protection tak pahunch jaate the.
 * Stick ka visual har move par turant update hota rehta hai; sirf network send throttle hai.
 */
const SEND_INTERVAL_MS = 50;

/** Touch-capable device hai ya nahi — sirf tabhi joystick dikhana hai (keyboard-only desktop par nahi). */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

/**
 * Pure function: touch point ko joystick base ke center se relative (dx,dy) diya, agar base ki
 * radius se bahar ho to circle ke andar clamp karta hai — stick visually kabhi base se bahar nahi
 * jaata. Wapas dono: visual px offset (stick render karne ke liye) aur normalized -1..1 direction.
 */
export function clampToRadius(dx: number, dy: number, radius: number): { px: { x: number; y: number }; dir: { x: number; y: number } } {
  const dist = Math.hypot(dx, dy);
  const clamped = dist > radius ? { x: (dx / dist) * radius, y: (dy / dist) * radius } : { x: dx, y: dy };
  return { px: clamped, dir: { x: clamped.x / radius, y: clamped.y / radius } };
}

/**
 * Mobile ke liye on-screen movement joystick — keyboard input (`useKeyboardInput`) jaisa hi
 * `onChange(x, y)` bhejta hai (-1..1 dono axes), server khud clamp karta hai. Dono ek saath kaam
 * kar sakte hain (server sirf aakhri input yaad rakhta hai) — asal me user ek waqt me ek hi
 * istemal karta hai, isliye alag se merge/priority logic ki zaroorat nahi.
 */
export function VirtualJoystick({ onChange }: Props) {
  const baseRef = useRef<HTMLDivElement | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const lastSentAt = useRef(0);
  const [stick, setStick] = useState({ x: 0, y: 0 });

  /** `force` = release/press jaisa moment, jise kabhi drop nahi karna (warna player chalta reh jaata). */
  function updateFromPoint(clientX: number, clientY: number, force = false): void {
    const base = baseRef.current;
    if (!base) return;
    const rect = base.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const { px, dir } = clampToRadius(clientX - cx, clientY - cy, RADIUS);
    setStick(px); // visual hamesha turant
    const now = Date.now();
    if (!force && now - lastSentAt.current < SEND_INTERVAL_MS) return;
    lastSentAt.current = now;
    onChange(dir.x, dir.y);
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    updateFromPoint(e.clientX, e.clientY, true);
  }
  function handlePointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.pointerId !== pointerIdRef.current) return;
    updateFromPoint(e.clientX, e.clientY);
  }
  function release(e: React.PointerEvent<HTMLDivElement>): void {
    if (e.pointerId !== pointerIdRef.current) return;
    pointerIdRef.current = null;
    setStick({ x: 0, y: 0 });
    onChange(0, 0);
  }

  return (
    <div
      ref={baseRef}
      role="slider"
      aria-label="Movement joystick"
      aria-valuenow={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={release}
      onPointerCancel={release}
      className="relative touch-none select-none rounded-full bg-white/10"
      style={{ width: BASE_SIZE, height: BASE_SIZE }}
    >
      <div
        aria-hidden="true"
        className="absolute rounded-full bg-amber-400/80"
        style={{
          width: BASE_SIZE * 0.45,
          height: BASE_SIZE * 0.45,
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${stick.x}px), calc(-50% + ${stick.y}px))`,
        }}
      />
    </div>
  );
}
