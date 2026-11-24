import { GLOBAL_TIME_BUDGET, type Level } from "../game/model";
import { formatClock } from "../game/scoring";

export function Silk({ children, lit }: { children: React.ReactNode; lit?: boolean }) {
  return <div className={`silk ${lit ? "silk-lt" : ""}`}>{children}</div>;
}

export function Screw({ className = "" }: { className?: string }) {
  return <span className={`screw ${className}`} />;
}

/** bargraph segmentado de painel de instrumento
 *  Cor por NÍVEL (não por posição): cheia = verde, metade = âmbar,
 *  perto do fim = vermelho crítico. Enche de baixo para cima / da esquerda para a direita
 *  e esvazia na mesma direção — quanto mais perto de acabar, mais crítico. */
export function Bargraph({
  value,
  segs = 22,
  vertical,
  danger,
}: {
  value: number;
  segs?: number;
  vertical?: boolean;
  danger?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const on = Math.round((pct / 100) * segs);
  const tier = danger || pct <= 25 ? "crit" : pct <= 55 ? "warn" : "ok";
  const cells = Array.from({ length: segs }, (_, i) => {
    const active = i < on;
    const color = !active
      ? "bg-[#141c1a]"
      : tier === "crit"
        ? "bg-alarm"
        : tier === "warn"
          ? "bg-amber"
          : "bg-phos";
    return (
      <div
        key={i}
        className={`${color} ${active ? "opacity-100" : "opacity-70"}`}
        style={{
          boxShadow: active
            ? `0 0 5px ${
                color.includes("alarm")
                  ? "#ff4d2e"
                  : color.includes("amber")
                    ? "#ffb23f"
                    : "#39ff88"
              }66`
            : "none",
          transition: "background-color 140ms linear",
          ...(vertical
            ? { flex: "1 1 0%", width: "100%" }
            : { flex: "1 1 0%", height: "100%" }),
        }}
      />
    );
  });
  return (
    <div
      className={`flex ${vertical ? "flex-col-reverse gap-[2px]" : "flex-row gap-[2px]"}`}
      style={vertical ? { height: "clamp(84px, 16vh, 132px)", width: 14 } : { height: 12 }}
    >
      {cells}
    </div>
  );
}

export function StatusRail({
  lv,
  score,
  combo,
  integ,
  globalClock,
  level,
  total,
  paused,
  onPause,
}: {
  lv: Level;
  score: number;
  combo: number;
  integ: number;
  globalClock: number;
  level: number;
  total: number;
  paused: boolean;
  onPause: () => void;
}) {
  const globalPct = (globalClock / GLOBAL_TIME_BUDGET) * 100;
  const leds: [string, boolean, string][] = [
    ["LINK", true, "#39ff88"],
    ["IDS", integ > 35, integ > 35 ? "#39ff88" : "#ff4d2e"],
    ["FW", integ > 15, integ > 15 ? "#ffb23f" : "#ff4d2e"],
    ["SAT", false, "#ffb23f"],
  ];
  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-col gap-2 overflow-hidden">
      <div className="module relative px-3 py-3">
        <Screw className="left-1.5 top-1.5" />
        <Screw className="right-1.5 top-1.5" />
        <Silk>pontuação</Silk>
        <div className="disp tabnum mt-1.5 text-[clamp(22px,2.2vw,30px)] leading-none break-all text-phos glow">
          {score.toLocaleString("pt-BR")}
        </div>
        <div className="mt-1 flex items-center justify-between">
          <Silk>cadeia</Silk>
          <span className={`tabnum text-[12px] font-bold ${combo > 1 ? "text-amber" : "text-slate"}`}>
            ×{combo.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="module relative flex min-h-0 flex-1 gap-3 overflow-hidden px-3 py-3">
        <Screw className="right-1.5 top-1.5" />
        <div className="flex min-w-0 flex-1 items-end justify-around gap-2 sm:gap-3">
          <div className="flex flex-col items-center gap-2">
            <Bargraph value={integ} vertical danger={integ < 25} />
            <Silk lit>integ.</Silk>
            <span className="tabnum text-[11px] text-phos-lt">
              {Math.max(0, integ).toFixed(1)}%
            </span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Bargraph value={globalPct} vertical danger={globalPct < 15} />
            <Silk lit>operação</Silk>
            <span className="tabnum text-[11px] text-phos-lt">{formatClock(globalClock)}</span>
          </div>
        </div>
        <div className="flex w-[74px] min-w-0 shrink-0 flex-col justify-between gap-2 overflow-hidden border-l border-hair pl-3">
          <div className="min-w-0">
            <Silk>alvo</Silk>
            <div className="mt-1 text-[10.5px] leading-tight break-all text-phos-lt">{lv.alvo}</div>
            <div className="tabnum mt-0.5 text-[10px] break-all text-slate2">{lv.ip}</div>
          </div>
          <div className="min-w-0">
            <Silk>setor</Silk>
            <div className="mt-1 text-[9.5px] leading-tight break-words text-slate">{lv.setor}</div>
          </div>
          <div>
            <Silk>status</Silk>
            <div className="mt-1.5 flex flex-col gap-1.5">
              {leds.map(([n, blink, c]) => (
                <div key={n} className="flex items-center gap-1.5">
                  <span className={`led ${blink ? "led-blink" : ""}`} style={{ color: c }} />
                  <span className="silk">{n}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Silk>faixa</Silk>
            <div className="tabnum mt-1 text-[11px] text-amber">
              {level}/{total}
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={onPause}
        className="module btn-slab py-2.5 text-center text-[10px] tracking-[0.28em] text-slate uppercase hover:text-phos"
      >
        {paused ? "retomar · esc" : "pausar · esc"}
      </button>
    </div>
  );
}

export function SystemLogFeed({
  lv,
  events,
}: {
  lv: Level;
  events: { t: string; tone: string }[];
}) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="module relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 py-3">
        <Screw className="left-1.5 top-1.5" />
        <Screw className="right-1.5 top-1.5" />
        <div className="flex shrink-0 flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-b border-hair pb-1.5">
          <Silk lit>monitor de integridade soc</Silk>
          <span className="tabnum font-mono text-[11px] break-all text-amber">{lv.ip}</span>
        </div>
        <div className="no-scrollbar mt-2 min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="text-[10px] tracking-[0.22em] break-all text-slate2 uppercase">
            vetor: {lv.attackerIp}
          </div>
          <div className="mt-1 text-[11px] leading-snug break-words text-slate">
            {lv.resumo}
          </div>

          <div className="mt-3 border-t border-hair pt-2 text-[10.5px]">
            <Silk lit>parâmetros do setor</Silk>
            <div className="mt-1 grid grid-cols-2 gap-2 text-[10px] text-slate2 [&>div]:min-w-0 [&>div]:break-words">
              <div>Portas monitoradas: <span className="text-phos-lt font-mono">{lv.socks.length}</span></div>
              <div>Processos ativos: <span className="text-phos-lt font-mono">{lv.procs.length}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="module relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-3 py-3">
        <Screw className="left-1.5 top-1.5" />
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-hair pb-1">
          <Silk lit>journal de eventos em tempo real</Silk>
          <span className="led led-blink shrink-0 text-phos" />
        </div>
        <div className="no-scrollbar mt-2 min-h-0 min-w-0 flex-1 overflow-y-auto text-[10.5px] leading-[1.6]">
          {events.slice(-20).map((e, i) => (
            <div
              key={i}
              title={e.t}
              className={`break-words font-mono ${
                e.tone === "err"
                  ? "text-alarm"
                  : e.tone === "warn"
                    ? "text-amber"
                    : e.tone === "ok"
                      ? "text-phos glow"
                      : "text-slate2"
              }`}
            >
              {e.t}
            </div>
          ))}
          {!events.length && <div className="text-slate2">— sem eventos registrados —</div>}
        </div>
      </div>
    </div>
  );
}

export function Mark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="INITIUM">
      <path
        d="M24 2.5 43.5 13v22L24 45.5 4.5 35V13L24 2.5Z"
        fill="none"
        stroke="#39ff88"
        strokeWidth="2"
      />
      <path d="M24 8 38 15.6v16.8L24 40 10 32.4V15.6L24 8Z" fill="#04100c" />
      <path d="M21.4 15h5.2v5.1h-5.2zM21.4 22.4h5.2v10.6h-5.2z" fill="#39ff88" />
      <path
        d="M26.6 24.6h8.6M26.6 28.2h5.4M12.8 24.6h8.6M16 28.2h5.4"
        stroke="#39ff88"
        strokeWidth="1.4"
      />
      <circle cx="36.4" cy="24.6" r="1.5" fill="#ffb23f" />
    </svg>
  );
}
