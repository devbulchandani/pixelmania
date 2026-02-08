'use client';

import { useRef, useEffect, useState } from 'react';
import { AssetSymbol, ASSET_METADATA } from '@/lib/constants';
import { TargetBlock, Viewport } from './GameEngine';

// ── Particle type for win/loss animations ──────────────────────────────
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
  type: 'burst' | 'shatter';
  rotation?: number; rotationSpeed?: number;
}

interface GameCanvasProps {
  currentPrice: number | null;
  priceHistory: { time: number; price: number }[];
  blocks: TargetBlock[];
  selectedAsset: AssetSymbol;
  viewport: Viewport;
  visibleBounds: { min: number; max: number; range: number };
  viewportCenterPrice: number | null;
  onPan: (dx: number, dy: number, w: number, h: number) => void;
  onPlaceBet: (x: number, y: number, w: number, h: number) => void;
  confirmedCells?: Set<string>;
  pendingCells?: Set<string>;
}

// ── Multiplier math (mirrors GameEngine) ───────────────────────────────
const calcMultiplier = (target: number, current: number): number => {
  const bps = (Math.abs(target - current) * 10000) / current;
  return Math.min(Math.max((110 + (bps * 2000) / 1000) / 100, 1.1), 50);
};

const multiplierColor = (m: number) => {
  if (m >= 2.0) return { bg: 'rgba(178,255,158,0.15)', border: '#B2FF9E', text: '#B2FF9E' };
  if (m >= 1.6) return { bg: 'rgba(182,166,255,0.12)', border: '#B6A6FF', text: '#B6A6FF' };
  if (m >= 1.35) return { bg: 'rgba(178,255,158,0.10)', border: '#B2FF9E', text: '#D1FFB9' };
  if (m >= 1.2) return { bg: 'rgba(182,166,255,0.08)', border: '#C4B6FF', text: '#D1C9FF' };
  return { bg: 'rgba(255,255,255,0.05)', border: '#D1D5DB', text: '#E5E7EB' };
};

// ── Constants ──────────────────────────────────────────────────────────
const COL = {
  mint: '#B2FF9E', purple: '#B6A6FF', dark: '#121212',
  cellBase: 'rgba(255,255,255,0.05)', cellBorder: '#D1D5DB',
};
const TIME_STEP = 2500;
const PRICE_ROWS = 8;
const BETTING_COLS = 12;
const BETTING_PCT = 0.75;
const LOCK_ZONE_MS = 20_000; // 20-second boundary
const CELL_R = 14;
const CELL_GAP = 4;
const Y_AXIS_W = 82; // right-side Y-axis slot

export default function GameCanvas({
  currentPrice, priceHistory, blocks, selectedAsset,
  viewport, visibleBounds, viewportCenterPrice,
  onPan, onPlaceBet, confirmedCells, pendingCells,
}: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const processedRef = useRef<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  // ── Particle factories ─────────────────────────────────────────────
  const burstAt = (x: number, y: number) => {
    const cols = ['#4ade80', '#22c55e', '#86efac', '#fde047', '#fff', '#a3e635'];
    for (let i = 0; i < 60; i++) {
      const a = (Math.PI * 2 * i) / 60 + Math.random() * 0.3;
      const s = 6 + Math.random() * 14;
      particlesRef.current.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1, maxLife: 1, size: 5 + Math.random() * 7,
        color: cols[Math.floor(Math.random() * cols.length)], type: 'burst',
      });
    }
  };
  const shatterAt = (x: number, y: number, w: number, h: number) => {
    const cols = ['#ef4444', '#dc2626', '#f87171', '#ff6b6b'];
    for (let i = 0; i < 50; i++) {
      const a = (Math.PI * 2 * i) / 50 + Math.random() * 0.3;
      const s = 5 + Math.random() * 11;
      particlesRef.current.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 1, maxLife: 1, size: 6 + Math.random() * 9,
        color: cols[Math.floor(Math.random() * cols.length)], type: 'shatter',
        rotation: Math.random() * Math.PI * 2, rotationSpeed: (Math.random() - 0.5) * 0.5,
      });
    }
  };
  const drawParticles = (ctx: CanvasRenderingContext2D) => {
    const ps = particlesRef.current;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.vx *= 0.99; p.life -= 0.015;
      if (p.rotation !== undefined && p.rotationSpeed !== undefined) p.rotation += p.rotationSpeed;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = Math.min(1, p.life * 1.5);
      if (p.type === 'burst') {
        ctx.shadowBlur = 12; ctx.shadowColor = p.color; ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + p.life * 0.5), 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.translate(p.x, p.y); if (p.rotation !== undefined) ctx.rotate(p.rotation);
        ctx.shadowBlur = 8; ctx.shadowColor = p.color; ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
  };

  // ── Helpers ────────────────────────────────────────────────────────
  const squircle = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    const cr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + cr, y);
    ctx.lineTo(x + w - cr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + cr);
    ctx.lineTo(x + w, y + h - cr); ctx.quadraticCurveTo(x + w, y + h, x + w - cr, y + h);
    ctx.lineTo(x + cr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - cr);
    ctx.lineTo(x, y + cr); ctx.quadraticCurveTo(x, y, x + cr, y);
    ctx.closePath();
  };

  const w2s = (time: number, price: number, W: number, H: number) => {
    const now = Date.now();
    const bW = W * BETTING_PCT;
    const nowX = W - bW - Y_AXIS_W; // account for right-side Y-axis
    const pxMs = bW / (BETTING_COLS * TIME_STEP);
    const x = nowX + ((time - now + viewport.timeOffset) * pxMs);
    const ratio = (price - visibleBounds.min) / visibleBounds.range;
    const y = H - (ratio * H);
    return { x, y };
  };

  const fmtPrice = (p: number) => {
    if (p >= 10000) return p.toFixed(0);
    if (p >= 1000) return p.toFixed(1);
    if (p >= 100) return p.toFixed(2);
    if (p >= 1) return p.toFixed(3);
    return p.toFixed(6);
  };

  // ── RENDER LOOP ────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const W = container.clientWidth;
    const H = container.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, W, H);

    if (!currentPrice) {
      ctx.fillStyle = COL.dark; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = COL.mint; ctx.font = '600 18px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('Connecting to Pyth price feed...', W / 2, H / 2);
      return;
    }

    const now = Date.now();
    const priceStep = visibleBounds.range / PRICE_ROWS;
    const { x: nowX } = w2s(now, currentPrice, W, H);
    const bettingW = W * BETTING_PCT;

    // Deadline: 20s into the future
    const deadlineTime = now + LOCK_ZONE_MS;
    const { x: deadlineX } = w2s(deadlineTime, currentPrice, W, H);

    const firstT = Math.floor(now / TIME_STEP) * TIME_STEP;
    const endT = firstT + (BETTING_COLS * TIME_STEP);
    const firstP = Math.floor(visibleBounds.min / priceStep) * priceStep;

    const blockAt = (t: number, pMin: number, pMax: number): TargetBlock | null =>
      blocks.find(b => {
        const bt = Math.floor(b.expiryTime / TIME_STEP) * TIME_STEP;
        return bt === t && b.targetPrice >= pMin && b.targetPrice < pMax;
      }) || null;

    // ── A. GRID CELLS ────────────────────────────────────────────────
    const drawableW = W - Y_AXIS_W; // exclude right Y-axis

    for (let t = firstT; t < endT + TIME_STEP; t += TIME_STEP) {
      for (let p = firstP; p < visibleBounds.max + priceStep; p += priceStep) {
        const { x: x1, y: y1 } = w2s(t, p + priceStep, W, H);
        const { x: x2, y: y2 } = w2s(t + TIME_STEP, p, W, H);
        const cx1 = Math.max(x1, nowX);
        const cw = Math.min(x2, drawableW) - cx1 - CELL_GAP;
        const ch = y2 - y1 - CELL_GAP;
        if (x2 < nowX || cx1 > drawableW || y2 < 0 || y1 > H || cw <= 0) continue;

        const ccPrice = p + priceStep / 2;
        const mult = calcMultiplier(ccPrice, currentPrice);
        const mCol = multiplierColor(mult);
        const ccx = cx1 + cw / 2;
        const ccy = y1 + ch / 2;

        // Is this cell in the LOCK ZONE?
        const cellMidTime = t + TIME_STEP / 2;
        const isLocked = cellMidTime < deadlineTime;

        const isHovered = mousePos && mousePos.x >= cx1 && mousePos.x <= cx1 + cw && mousePos.y >= y1 && mousePos.y <= y1 + ch;
        const block = blockAt(t, p, p + priceStep);

        if (block) {
          // ── BET CELL ──
          if (block.status === 'HIT' && !processedRef.current.has(block.id + '_h')) {
            processedRef.current.add(block.id + '_h'); burstAt(ccx, ccy);
          } else if (block.status === 'MISSED' && !processedRef.current.has(block.id + '_m')) {
            processedRef.current.add(block.id + '_m'); shatterAt(ccx, ccy, cw, ch);
          }
          let bCol = COL.mint, glow = 15, draw = true;
          if (block.status === 'HIT') {
            bCol = '#4ade80'; glow = 30;
            const dt = block.hitTime ? now - block.hitTime : 500;
            if (dt > 500) { ctx.globalAlpha = Math.max(0, 1 - (dt - 500) / 1000); if (ctx.globalAlpha <= 0) draw = false; }
          } else if (block.status === 'MISSED') { bCol = '#ef4444'; ctx.globalAlpha = 0.4; }

          if (draw) {
            let sc = 1;
            if (block.status === 'PENDING') sc = 1 + Math.sin(now * 0.002) * 0.02;
            const sw = cw * sc, sh = ch * sc, ox = (cw - sw) / 2, oy = (ch - sh) / 2;
            ctx.shadowBlur = glow; ctx.shadowColor = bCol; ctx.fillStyle = 'rgba(0,0,0,0.7)';
            squircle(ctx, cx1 + ox, y1 + oy, sw, sh, CELL_R); ctx.fill();
            ctx.strokeStyle = bCol; ctx.lineWidth = 3;
            squircle(ctx, cx1 + ox, y1 + oy, sw, sh, CELL_R); ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            if (cw > 50 && ch > 35) {
              const fs = Math.min(ch / 4, 12);
              ctx.font = `600 ${fs}px Inter, system-ui, sans-serif`;
              ctx.fillText(`$${block.amount}`, ccx, ccy - ch * 0.15);
              ctx.font = `700 ${fs + 2}px Inter, system-ui, sans-serif`;
              ctx.fillStyle = block.status === 'HIT' ? '#4ade80' : block.status === 'MISSED' ? '#ef4444' : mCol.text;
              ctx.fillText(`${block.multiplier.toFixed(2)}x`, ccx, ccy + ch * 0.18);
            } else {
              ctx.font = `700 ${Math.min(ch / 3, 11)}px Inter, system-ui, sans-serif`;
              ctx.fillText(`${block.multiplier.toFixed(2)}x`, ccx, ccy);
            }
          }
          ctx.globalAlpha = 1;

        } else {
          // ── EMPTY CELL ──
          // Lock-zone frosted glass
          if (isLocked) {
            ctx.fillStyle = 'rgba(40, 40, 50, 0.55)';
            squircle(ctx, cx1, y1, cw, ch, CELL_R); ctx.fill();
            ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
            squircle(ctx, cx1, y1, cw, ch, CELL_R); ctx.stroke();
            // Dim multiplier text
            if (cw > 40 && ch > 25) {
              ctx.fillStyle = 'rgba(255,255,255,0.15)';
              ctx.font = '500 10px Inter, system-ui, sans-serif';
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(`${mult.toFixed(2)}x`, ccx, ccy);
            }
          } else {
            let lift = 0, scale = 1;
            if (isHovered) { lift = -2; scale = 1.02; }
            const sw = cw * scale, sh = ch * scale;
            const ox = (cw - sw) / 2, oy = (ch - sh) / 2 + lift;
            ctx.fillStyle = isHovered ? COL.mint + '20' : COL.cellBase;
            if (isHovered) { ctx.shadowBlur = 20; ctx.shadowColor = COL.mint; }
            squircle(ctx, cx1 + ox, y1 + oy, sw, sh, CELL_R); ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = isHovered ? COL.mint : COL.cellBorder;
            ctx.lineWidth = isHovered ? 2 : 1;
            squircle(ctx, cx1 + ox, y1 + oy, sw, sh, CELL_R); ctx.stroke();
            if (cw > 40 && ch > 25) {
              ctx.fillStyle = isHovered ? '#fff' : mCol.text;
              ctx.font = isHovered ? '700 14px Inter, system-ui, sans-serif' : '600 11px Inter, system-ui, sans-serif';
              ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
              ctx.fillText(`${mult.toFixed(2)}x`, ccx, ccy);
            }
          }
        }
      }
    }

    // ── B. 20s BOUNDARY LINE (Lavender) ──────────────────────────────
    if (deadlineX > nowX && deadlineX < drawableW) {
      ctx.save();
      ctx.strokeStyle = 'rgba(182, 166, 255, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath(); ctx.moveTo(deadlineX, 0); ctx.lineTo(deadlineX, H); ctx.stroke();
      ctx.setLineDash([]);
      // Label
      ctx.fillStyle = 'rgba(182, 166, 255, 0.5)';
      ctx.font = '600 10px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText('LOCK', deadlineX, 16);
      ctx.restore();
    }

    // ── C. PAST AREA (subtle grid) ───────────────────────────────────
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1; ctx.beginPath();
    const pastStart = Math.floor((now - 30_000) / TIME_STEP) * TIME_STEP;
    for (let t = pastStart; t < now; t += TIME_STEP) {
      const { x } = w2s(t, visibleBounds.min, W, H);
      if (x > 0 && x < nowX) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    }
    for (let p = firstP; p < visibleBounds.max; p += priceStep) {
      const { y } = w2s(now, p, W, H);
      ctx.moveTo(0, y); ctx.lineTo(nowX, y);
    }
    ctx.stroke();

    // Past blocks
    blocks.forEach(b => {
      const gt = Math.floor(b.expiryTime / TIME_STEP) * TIME_STEP;
      if (gt >= firstT) return;
      const { x: bx1, y: by1 } = w2s(gt, b.targetPrice + priceStep / 2, W, H);
      const { x: bx2, y: by2 } = w2s(gt + TIME_STEP, b.targetPrice - priceStep / 2, W, H);
      if (bx2 < 0 || bx1 > nowX || by2 < 0 || by1 > H) return;
      const bw = bx2 - bx1, bh = by2 - by1, bcx = (bx1 + bx2) / 2, bcy = (by1 + by2) / 2;
      if (b.status === 'HIT' && !processedRef.current.has(b.id + '_h')) { processedRef.current.add(b.id + '_h'); burstAt(bcx, bcy); }
      if (b.status === 'MISSED' && !processedRef.current.has(b.id + '_m')) { processedRef.current.add(b.id + '_m'); shatterAt(bcx, bcy, bw, bh); }
      let col = '#888', draw = true;
      if (b.status === 'HIT') { col = '#4ade80'; const dt = b.hitTime ? now - b.hitTime : 500; if (dt > 500) { ctx.globalAlpha = Math.max(0, 1 - (dt - 500) / 1000); if (ctx.globalAlpha <= 0) draw = false; } }
      else if (b.status === 'MISSED') { col = '#ef4444'; ctx.globalAlpha = 0.3; }
      if (draw) {
        ctx.shadowBlur = 10; ctx.shadowColor = col; ctx.fillStyle = 'rgba(0,0,0,0.6)';
        squircle(ctx, bx1, by1, bw, bh, CELL_R); ctx.fill();
        ctx.strokeStyle = col; ctx.lineWidth = 2; squircle(ctx, bx1, by1, bw, bh, CELL_R); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '700 11px Inter, system-ui, sans-serif';
        ctx.fillText(`${b.multiplier.toFixed(2)}x`, bcx, bcy);
      }
      ctx.globalAlpha = 1;
    });

    // ── D. RIGHT-SIDE Y-AXIS (Bento slot) ────────────────────────────
    const yAxisX = W - Y_AXIS_W;
    // Background
    const yGrad = ctx.createLinearGradient(yAxisX, 0, W, 0);
    yGrad.addColorStop(0, 'rgba(18,18,18,0.6)');
    yGrad.addColorStop(1, COL.dark);
    ctx.fillStyle = yGrad;
    ctx.fillRect(yAxisX, 0, Y_AXIS_W, H);
    // Left border
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(yAxisX, 0); ctx.lineTo(yAxisX, H); ctx.stroke();

    // Price labels — geometric sans-serif, fade at edges
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let p = firstP; p <= visibleBounds.max; p += priceStep) {
      const { y } = w2s(now, p, W, H);
      if (y < 0 || y > H) continue;
      // Fade labels near top/bottom edges
      const edgeDist = Math.min(y, H - y);
      const fade = Math.min(1, edgeDist / 40);

      const isNear = Math.abs(p - currentPrice) < priceStep * 0.5;
      if (isNear) {
        ctx.globalAlpha = fade;
        ctx.fillStyle = COL.mint;
        squircle(ctx, yAxisX + 6, y - 12, Y_AXIS_W - 16, 24, 8); ctx.fill();
        ctx.fillStyle = COL.dark;
        ctx.font = '700 11px Inter, system-ui, sans-serif';
      } else {
        ctx.globalAlpha = 0.5 * fade;
        ctx.fillStyle = '#fff';
        ctx.font = '500 11px Inter, system-ui, sans-serif';
      }
      ctx.fillText(`$${fmtPrice(p)}`, yAxisX + 10, y);
      ctx.globalAlpha = 1;
    }

    // Current-price arrow on Y-axis
    const { y: cpY } = w2s(now, currentPrice, W, H);
    if (cpY > 5 && cpY < H - 5) {
      ctx.shadowBlur = 12; ctx.shadowColor = COL.mint; ctx.fillStyle = COL.mint;
      ctx.beginPath();
      ctx.moveTo(yAxisX, cpY); ctx.lineTo(yAxisX - 10, cpY - 8); ctx.lineTo(yAxisX - 10, cpY + 8);
      ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
    }

    // ── E. TIME LABELS (bottom) ──────────────────────────────────────
    const TLH = 26;
    ctx.save();
    ctx.fillStyle = 'rgba(18,18,18,0.85)';
    ctx.fillRect(nowX, H - TLH, drawableW - nowX, TLH);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(nowX, H - TLH); ctx.lineTo(drawableW, H - TLH); ctx.stroke();
    ctx.font = '600 10px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let t = firstT; t < endT + TIME_STEP; t += TIME_STEP) {
      const { x: cx } = w2s(t + TIME_STEP / 2, currentPrice, W, H);
      if (cx < nowX || cx > drawableW) continue;
      const sec = Math.round((t - now) / 1000);
      const labelY = H - TLH / 2;
      if (sec <= 0 && sec > -(TIME_STEP / 1000)) {
        ctx.fillStyle = COL.mint; ctx.font = '700 11px Inter, system-ui, sans-serif';
        ctx.fillText('NOW', cx, labelY); ctx.font = '600 10px Inter, system-ui, sans-serif';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(sec > 0 ? `+${sec}s` : `${sec}s`, cx, labelY);
      }
    }
    ctx.restore();

    // ── F. PRICE LINE + GLOW ─────────────────────────────────────────
    if (priceHistory.length > 1) {
      const { x: extX, y: extY } = w2s(now, currentPrice, W, H);

      // Gradient fill
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, COL.mint + '60'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.beginPath();
      priceHistory.forEach((pt, i) => {
        const { x, y } = w2s(pt.time, pt.price, W, H);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.lineTo(extX, extY); ctx.lineTo(extX, H);
      ctx.lineTo(w2s(priceHistory[0].time, 0, W, H).x, H);
      ctx.closePath(); ctx.fillStyle = grad; ctx.fill();

      // Glow layers
      for (let l = 3; l > 0; l--) {
        ctx.beginPath(); ctx.strokeStyle = COL.mint;
        ctx.lineWidth = 1.5 + l * 1.5; ctx.globalAlpha = 0.3 / l;
        ctx.shadowBlur = 15 * l; ctx.shadowColor = COL.mint;
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        priceHistory.forEach((pt, i) => {
          const { x, y } = w2s(pt.time, pt.price, W, H);
          if (i === 0) ctx.moveTo(x, y);
          else { const prev = priceHistory[i - 1]; const { x: px, y: py } = w2s(prev.time, prev.price, W, H); ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2); }
        });
        ctx.lineTo(extX, extY); ctx.stroke();
      }
      // Main bright line
      ctx.globalAlpha = 1; ctx.beginPath(); ctx.strokeStyle = COL.mint;
      ctx.lineWidth = 3; ctx.shadowBlur = 20; ctx.shadowColor = COL.mint;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      priceHistory.forEach((pt, i) => {
        const { x, y } = w2s(pt.time, pt.price, W, H);
        if (i === 0) ctx.moveTo(x, y);
        else { const prev = priceHistory[i - 1]; const { x: px, y: py } = w2s(prev.time, prev.price, W, H); ctx.quadraticCurveTo(px, py, (px + x) / 2, (py + y) / 2); }
      });
      ctx.lineTo(extX, extY); ctx.stroke(); ctx.shadowBlur = 0;

      // Animated pulse dot
      const pT = now * 0.004;
      for (let r = 0; r < 3; r++) {
        const phase = (pT + r * 2.1) % (Math.PI * 2);
        const exp = (Math.sin(phase) + 1) / 2;
        ctx.beginPath(); ctx.arc(extX, extY, 6 + exp * 14, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(178,255,158,${(1 - exp) * 0.35})`; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.shadowBlur = 20; ctx.shadowColor = COL.mint; ctx.fillStyle = COL.mint;
      ctx.beginPath(); ctx.arc(extX, extY, 5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 12; ctx.shadowColor = '#fff'; ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(extX, extY, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    // ── G. LASER LINE at currentPrice ────────────────────────────────
    {
      const { y: ly } = w2s(now, currentPrice, W, H);
      if (ly > 0 && ly < H) {
        ctx.save();
        const pulse = 0.7 + Math.sin(now * 0.005) * 0.3;
        // Past (dashed)
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = `rgba(178,255,158,${0.12 * pulse})`; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(nowX, ly); ctx.stroke();
        ctx.strokeStyle = `rgba(178,255,158,${0.4 * pulse})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(nowX, ly); ctx.stroke();
        ctx.setLineDash([]);
        // Future (solid + glow)
        ctx.shadowBlur = 14; ctx.shadowColor = `rgba(178,255,158,${0.6 * pulse})`;
        ctx.strokeStyle = `rgba(178,255,158,${0.15 * pulse})`; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(nowX, ly); ctx.lineTo(drawableW, ly); ctx.stroke();
        ctx.shadowBlur = 6;
        ctx.strokeStyle = `rgba(178,255,158,${0.35 * pulse})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(nowX, ly); ctx.lineTo(drawableW, ly); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = `rgba(178,255,158,${0.9 * pulse})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(nowX, ly); ctx.lineTo(drawableW, ly); ctx.stroke();
        ctx.restore();
      }
    }

    // ── H. Particles ─────────────────────────────────────────────────
    drawParticles(ctx);

    // ── I. Hover Crosshair + Badge ───────────────────────────────────
    if (mousePos) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(mousePos.x, 0); ctx.lineTo(mousePos.x, H);
      ctx.moveTo(0, mousePos.y); ctx.lineTo(W, mousePos.y);
      ctx.stroke(); ctx.setLineDash([]);

      if (mousePos.x > nowX && mousePos.x < drawableW) {
        const hRatio = (H - mousePos.y) / H;
        const hPrice = visibleBounds.min + hRatio * visibleBounds.range;
        const hM = calcMultiplier(hPrice, currentPrice);
        const hC = multiplierColor(hM);
        const txt = `${hM.toFixed(2)}x`;
        ctx.font = '700 13px Inter, system-ui, sans-serif';
        const tw = ctx.measureText(txt).width;
        const bw = tw + 16, bh = 26, bx = mousePos.x + 16, by = mousePos.y - bh - 6;
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.shadowBlur = 8; ctx.shadowColor = hC.border;
        squircle(ctx, bx, by, bw, bh, 8); ctx.fill();
        ctx.strokeStyle = hC.border; ctx.lineWidth = 1.5;
        squircle(ctx, bx, by, bw, bh, 8); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = hC.text; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(txt, bx + bw / 2, by + bh / 2);
      }
    }

  }, [currentPrice, priceHistory, blocks, viewport, visibleBounds, viewportCenterPrice, mousePos, selectedAsset, tick]);

  // ── 60fps animation driver ─────────────────────────────────────────
  useEffect(() => {
    let id: number, run = true;
    const loop = () => { if (!run) return; setTick(t => t + 1); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => { run = false; cancelAnimationFrame(id); };
  }, []);

  // ── Mouse handlers ─────────────────────────────────────────────────
  const onDown = (e: React.MouseEvent) => {
    if (e.button === 2) { e.preventDefault(); setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY }); }
  };
  const onMove = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - r.left, y: e.clientY - r.top });
    if (isDragging && dragStart && (e.buttons & 2)) {
      onPan(e.clientX - dragStart.x, e.clientY - dragStart.y, r.width, r.height);
      setDragStart({ x: e.clientX, y: e.clientY });
    } else if (isDragging && !(e.buttons & 2)) { setIsDragging(false); setDragStart(null); }
  };
  const onUp = (e: React.MouseEvent) => { if (e.button === 2) { setIsDragging(false); setDragStart(null); } };
  const onClick = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const r = containerRef.current.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    // Block clicks in lock zone
    const drawableW = r.width - Y_AXIS_W;
    const { x: dlX } = w2s(Date.now() + LOCK_ZONE_MS, currentPrice || 0, r.width, r.height);
    if (x < dlX) return; // inside lock zone
    if (x > drawableW) return; // inside Y-axis
    onPlaceBet(x, y, r.width, r.height);
  };

  return (
    <div ref={containerRef} className="w-full h-full cursor-crosshair touch-none"
      onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
      onMouseLeave={() => { setIsDragging(false); setMousePos(null); }}
      onClick={onClick} onContextMenu={e => e.preventDefault()}>
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
