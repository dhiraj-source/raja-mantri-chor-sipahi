import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { DrawGuessStroke, DrawGuessStrokePoint, PlayerId } from '@rmc/shared-types';
import { StrokeBatcher, denormalizePoint, normalizePoint } from './strokeBatching';

export interface DrawTool {
  kind: 'PEN' | 'ERASER' | 'FILL';
  color: string;
  size: number;
}

export interface IncomingStroke {
  key: number;
  playerId: PlayerId;
  stroke: DrawGuessStroke;
}

interface Props {
  isDrawer: boolean;
  tool: DrawTool;
  /** Server se aaye strokes (apne khud ke strokes yahan nahi aate — wo already local hain). */
  incoming: readonly IncomingStroke[];
  onStroke: (stroke: DrawGuessStroke) => void;
}

/** Internal drawing resolution — CSS se jitna bhi bada/chhota dikhe, coordinates isi space me hain. */
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
const BATCH_MS = 60;
const WHITE = '#ffffff';

export interface CanvasHandle {
  /** Drawer ke apne Clear button ke liye — turant local safed, alag se `incoming` ka intezaar nahi karta. */
  clearLocal: () => void;
}

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas({ isDrawer, tool, incoming, onStroke }, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<DrawGuessStrokePoint | null>(null);
  const activeTool = useRef<DrawTool>(tool);
  const batcherRef = useRef<StrokeBatcher | null>(null);
  const paintedCount = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;
    ctxRef.current = ctx;
    if (ctx) {
      ctx.fillStyle = WHITE;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
    batcherRef.current = new StrokeBatcher(BATCH_MS, (points) => {
      const t = activeTool.current;
      if (t.kind === 'FILL') return; // fill batch nahi hota, seedha ek click par
      onStroke({ tool: t.kind, color: t.color, size: t.size, points });
    });
    return () => batcherRef.current?.cancel();
  }, []);

  // Naye remote strokes (jo abhi tak paint nahi hue) incrementally paint karo — poora canvas
  // dobara nahi banate, sirf jo naya aaya wahi. `incoming` chhota ho jaaye (naya turn: canvas
  // reset hua) to pehle safed karo, phir jo bacha hai wo paint karo.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (incoming.length < paintedCount.current) {
      ctx.fillStyle = WHITE;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      paintedCount.current = 0;
    }
    for (let i = paintedCount.current; i < incoming.length; i++) {
      const item = incoming[i];
      if (item) paintStroke(ctx, item.stroke);
    }
    paintedCount.current = incoming.length;
  }, [incoming]);

  useImperativeHandle(ref, () => ({
    clearLocal: () => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      ctx.fillStyle = WHITE;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    },
  }));

  function canvasPoint(e: React.PointerEvent<HTMLCanvasElement>): DrawGuessStrokePoint {
    const canvas = canvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (!canvas || !rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    return { x: (cssX / rect.width) * CANVAS_WIDTH, y: (cssY / rect.height) * CANVAS_HEIGHT };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (!isDrawer) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = canvasPoint(e);

    if (tool.kind === 'FILL') {
      const ctx = ctxRef.current;
      if (ctx) floodFill(ctx, p, tool.color);
      onStroke({ tool: 'FILL', color: tool.color, point: normalizePoint(p.x, p.y, CANVAS_WIDTH, CANVAS_HEIGHT) });
      return;
    }

    activeTool.current = tool;
    drawing.current = true;
    lastPoint.current = p;
    drawSegment(ctxRef.current, p, p, tool);
    batcherRef.current?.add(normalizePoint(p.x, p.y, CANVAS_WIDTH, CANVAS_HEIGHT));
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>): void {
    if (!isDrawer || !drawing.current) return;
    const p = canvasPoint(e);
    drawSegment(ctxRef.current, lastPoint.current, p, activeTool.current);
    lastPoint.current = p;
    batcherRef.current?.add(normalizePoint(p.x, p.y, CANVAS_WIDTH, CANVAS_HEIGHT));
  }

  function handlePointerUp(): void {
    if (!isDrawer || !drawing.current) return;
    drawing.current = false;
    lastPoint.current = null;
    batcherRef.current?.flushNow();
  }

  return (
    <canvas
      ref={canvasRef}
      width={CANVAS_WIDTH}
      height={CANVAS_HEIGHT}
      role="img"
      aria-label="Drawing canvas"
      className={`w-full touch-none rounded-xl bg-white ${isDrawer ? 'cursor-crosshair' : ''}`}
      style={{ aspectRatio: `${CANVAS_WIDTH} / ${CANVAS_HEIGHT}` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    />
  );
});

function drawSegment(
  ctx: CanvasRenderingContext2D | null,
  from: DrawGuessStrokePoint | null,
  to: DrawGuessStrokePoint,
  tool: DrawTool,
): void {
  if (!ctx || !from) return;
  ctx.strokeStyle = tool.kind === 'ERASER' ? WHITE : tool.color;
  ctx.lineWidth = tool.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function paintStroke(ctx: CanvasRenderingContext2D, stroke: DrawGuessStroke): void {
  if (stroke.tool === 'CLEAR') {
    ctx.fillStyle = WHITE;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    return;
  }
  if (stroke.tool === 'FILL') {
    floodFill(ctx, denormalizePoint(stroke.point, CANVAS_WIDTH, CANVAS_HEIGHT), stroke.color);
    return;
  }
  if (stroke.points.length === 0) return;
  ctx.strokeStyle = stroke.tool === 'ERASER' ? WHITE : stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const first = denormalizePoint(stroke.points[0] as DrawGuessStrokePoint, CANVAS_WIDTH, CANVAS_HEIGHT);
  ctx.moveTo(first.x, first.y);
  for (const raw of stroke.points.slice(1)) {
    const p = denormalizePoint(raw, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function colorsClose(a: readonly number[], b: readonly number[], tolerance: number): boolean {
  return Math.abs(a[0] as number - (b[0] as number)) <= tolerance &&
    Math.abs(a[1] as number - (b[1] as number)) <= tolerance &&
    Math.abs(a[2] as number - (b[2] as number)) <= tolerance &&
    Math.abs(a[3] as number - (b[3] as number)) <= tolerance;
}

/** Stack-based flood fill, thoda color-tolerance ke saath (anti-aliased edges ke leak se bachne ke liye). */
function floodFill(ctx: CanvasRenderingContext2D, point: DrawGuessStrokePoint, colorHex: string): void {
  const startX = Math.floor(point.x);
  const startY = Math.floor(point.y);
  if (startX < 0 || startY < 0 || startX >= CANVAS_WIDTH || startY >= CANVAS_HEIGHT) return;

  const image = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  const data = image.data;
  const targetIdx = (startY * CANVAS_WIDTH + startX) * 4;
  const target = [data[targetIdx], data[targetIdx + 1], data[targetIdx + 2], data[targetIdx + 3]] as number[];
  const [r, g, b] = hexToRgb(colorHex);
  const fill = [r, g, b, 255];
  if (colorsClose(target, fill, 10)) return;

  const tolerance = 48;
  const visited = new Uint8Array(CANVAS_WIDTH * CANVAS_HEIGHT);
  const stack: number[] = [startX, startY];
  while (stack.length > 0) {
    const cy = stack.pop() as number;
    const cx = stack.pop() as number;
    if (cx < 0 || cy < 0 || cx >= CANVAS_WIDTH || cy >= CANVAS_HEIGHT) continue;
    const vIdx = cy * CANVAS_WIDTH + cx;
    if (visited[vIdx]) continue;
    const idx = vIdx * 4;
    const here = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]] as number[];
    if (!colorsClose(here, target, tolerance)) continue;
    visited[vIdx] = 1;
    data[idx] = fill[0] as number;
    data[idx + 1] = fill[1] as number;
    data[idx + 2] = fill[2] as number;
    data[idx + 3] = 255;
    stack.push(cx + 1, cy, cx - 1, cy, cx, cy + 1, cx, cy - 1);
  }
  ctx.putImageData(image, 0, 0);
}
