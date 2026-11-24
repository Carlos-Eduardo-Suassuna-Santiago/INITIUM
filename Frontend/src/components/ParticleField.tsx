import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type BurstKind = "kill" | "fire" | "clean" | "ok";
export type ParticleHandle = {
  burst: (kind: BurstKind) => void;
  spike: () => void;
};

type P = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  c: string;
  streak: boolean;
};

const COLORS: Record<BurstKind, string[]> = {
  kill: ["#39ff88", "#8cffc0", "#ffffff"],
  fire: ["#ff4d2e", "#ffb23f", "#ffffff"],
  clean: ["#8cffc0", "#39ff88", "#ffffff"],
  ok: ["#39ff88", "#0b3d26", "#8cffc0"],
};

/** Campo de dados no vidro do CRT: chuva fina de bytes + rajadas de impacto. */
const ParticleField = forwardRef<ParticleHandle, { className?: string }>(
  function ParticleField({ className }, ref) {
    const cv = useRef<HTMLCanvasElement>(null);
    const parts = useRef<P[]>([]);
    const rain = useRef<P[]>([]);
    const raf = useRef(0);

    useImperativeHandle(ref, () => ({
      burst(kind: BurstKind) {
        const c = cv.current;
        if (!c) return;
        const cx = c.width / 2 / dpr();
        const cy = c.height / 2 / dpr();
        const pal = COLORS[kind];
        const n = kind === "kill" ? 90 : 60;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 1.4 + Math.random() * 7;
          parts.current.push({
            x: cx + (Math.random() - 0.5) * 30,
            y: cy + (Math.random() - 0.5) * 20,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp * 0.62,
            life: 0,
            max: 40 + Math.random() * 45,
            size: 0.7 + Math.random() * 1.9,
            c: pal[(Math.random() * pal.length) | 0],
            streak: Math.random() < 0.35,
          });
        }
        // onda de choque
        for (let i = 0; i < 42; i++) {
          const a = (i / 42) * Math.PI * 2;
          parts.current.push({
            x: cx, y: cy,
            vx: Math.cos(a) * 8.5,
            vy: Math.sin(a) * 5,
            life: -6, max: 26,
            size: 1.6,
            c: pal[0],
            streak: true,
          });
        }
      },
      spike() {
        const c = cv.current;
        if (!c) return;
        const cx = c.width / 2 / dpr();
        const cy = c.height / 2 / dpr();
        for (let i = 0; i < 16; i++)
          parts.current.push({
            x: cx + (Math.random() - 0.5) * c.width / dpr(),
            y: cy + (Math.random() - 0.5) * c.height / dpr(),
            vx: (Math.random() - 0.5) * 3,
            vy: -1 - Math.random() * 3,
            life: 0, max: 30, size: 1.2, c: COLORS.fire[0], streak: true,
          });
      },
    }));

    useEffect(() => {
      const c = cv.current!;
      const ctx = c.getContext("2d")!;
      let w = 0, h = 0;
      const d = dpr();
      const resize = () => {
        const r = c.getBoundingClientRect();
        w = Math.max(1, r.width); h = Math.max(1, r.height);
        c.width = w * d; c.height = h * d;
        ctx.setTransform(d, 0, 0, d, 0, 0);
        rain.current = Array.from({ length: 34 }, () => ({
          x: Math.random() * w, y: Math.random() * h,
          vx: 0, vy: 0.25 + Math.random() * 0.8,
          life: 0, max: 1, size: 0.6 + Math.random() * 1.2,
          c: Math.random() < 0.18 ? "#8cffc0" : "#0b3d26",
          streak: false,
        }));
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(c);

      const loop = () => {
        raf.current = requestAnimationFrame(loop);
        ctx.clearRect(0, 0, w, h);
        // chuva de bytes
        for (const p of rain.current) {
          p.y += p.vy;
          if (p.y > h) { p.y = -6; p.x = Math.random() * w; }
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = p.c;
          ctx.fillRect(p.x, p.y, p.size, p.size * 7);
        }
        ctx.globalAlpha = 1;
        // partículas de impacto
        const arr = parts.current;
        for (let i = arr.length - 1; i >= 0; i--) {
          const p = arr[i];
          p.life++;
          if (p.life < 0) continue;
          if (p.life > p.max) { arr.splice(i, 1); continue; }
          p.x += p.vx; p.y += p.vy;
          p.vx *= 0.955; p.vy = p.vy * 0.955 + 0.06;
          const t = 1 - p.life / p.max;
          ctx.globalAlpha = Math.max(0, t);
          ctx.fillStyle = p.c;
          if (p.streak) {
            ctx.fillRect(p.x, p.y, p.size * 5 * t + 1, p.size);
          } else {
            ctx.fillRect(p.x, p.y, p.size * 1.6, p.size * 1.6);
          }
        }
        ctx.globalAlpha = 1;
      };
      loop();
      return () => { cancelAnimationFrame(raf.current); ro.disconnect(); };
    }, []);

    return <canvas ref={cv} className={className} aria-hidden="true" />;
  }
);

function dpr() {
  return Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio || 1);
}

export default ParticleField;
