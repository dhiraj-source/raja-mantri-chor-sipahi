import { useEffect, useRef } from 'react';

/** WASD + arrow keys, dono ek saath kaam karte hain. */
export const KEY_MAP: Record<string, readonly [number, number]> = {
  ArrowUp: [0, -1],
  KeyW: [0, -1],
  ArrowDown: [0, 1],
  KeyS: [0, 1],
  ArrowLeft: [-1, 0],
  KeyA: [-1, 0],
  ArrowRight: [1, 0],
  KeyD: [1, 0],
};

/**
 * Pure function: abhi jitne movement keys dabe hain unse direction nikaalta hai — koi normalize
 * nahi karta yahan (diagonal magnitude sqrt(2) tak ho sakti hai), server khud clamp karta hai.
 */
export function computeDirection(pressedKeys: Iterable<string>): { x: number; y: number } {
  let x = 0;
  let y = 0;
  for (const code of pressedKeys) {
    const dir = KEY_MAP[code];
    if (!dir) continue;
    x += dir[0];
    y += dir[1];
  }
  return { x, y };
}

/**
 * Keyboard se movement direction nikaal kar `onChange` ko bhejta hai — sirf jab direction badle
 * (poll nahi, event-driven), taaki har frame network traffic na ho. Diagonal movement (jaise W+D)
 * ko normalize karne ki zaroorat client par nahi — server khud clamp karta hai (`clampMagnitude`).
 */
export function useKeyboardInput(enabled: boolean, onChange: (x: number, y: number) => void): void {
  const pressed = useRef(new Set<string>());
  const lastSent = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    function recompute(): void {
      const { x, y } = computeDirection(pressed.current);
      if (lastSent.current.x !== x || lastSent.current.y !== y) {
        lastSent.current = { x, y };
        onChangeRef.current(x, y);
      }
    }

    if (!enabled) {
      pressed.current.clear();
      recompute(); // agar chalte-chalte disable hua (jaise elimination), turant ruk jao
      return;
    }

    function onKeyDown(e: KeyboardEvent): void {
      if (!(e.code in KEY_MAP)) return;
      e.preventDefault(); // page scroll na ho arrow keys se
      if (!pressed.current.has(e.code)) {
        pressed.current.add(e.code);
        recompute();
      }
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (!(e.code in KEY_MAP)) return;
      e.preventDefault();
      if (pressed.current.delete(e.code)) recompute();
    }
    function onBlur(): void {
      if (pressed.current.size > 0) {
        pressed.current.clear();
        recompute();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      pressed.current.clear();
    };
  }, [enabled]);
}
