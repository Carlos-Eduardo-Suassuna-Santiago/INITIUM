import { useEffect, useMemo, useRef, useState } from "react";
import type { Line } from "../game/shell";
import type { Objective } from "../game/model";

type Props = {
  lines: Line[];
  prompt: string;
  chips: string[];
  busy: boolean;
  objetivos?: Objective[];
  done?: Record<string, boolean>;
  requirementProgress?: Record<string, { met: number; total: number }>;
  /** segundos gastos em cada tarefa já concluída */
  taskTimes?: Record<string, number>;
  /** cronômetro corrente da tarefa em andamento, em segundos */
  taskElapsed?: number;
  onSubmit: (cmd: string) => void;
  complete: (cur: string) => string[];
  onFocusHack?: number;
};

const TONE: Record<string, string> = {
  out: "text-[#8cffc0]",
  ok: "text-phos glow",
  err: "text-alarm glow-err",
  warn: "text-amber",
  dim: "text-[#7c918a]",
  cmd: "text-phos-lt",
};

export default function Terminal({
  lines,
  prompt,
  chips,
  busy,
  objetivos,
  done = {},
  requirementProgress = {},
  taskTimes = {},
  taskElapsed = 0,
  onSubmit,
  complete,
  onFocusHack,
}: Props) {
  const [val, setVal] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const inp = useRef<HTMLInputElement>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => lines.slice(-260), [lines]);

  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length]);

  useEffect(() => {
    if (onFocusHack) inp.current?.focus();
  }, [onFocusHack]);

  const submit = () => {
    const v = val.trim();
    if (!v || busy) return;
    onSubmit(v);
    setHist((h) => [...h, v]);
    setHi(-1);
    setVal("");
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const opts = complete(val);
      if (opts.length === 1) setVal(opts[0] + " ");
      else if (opts.length > 1) {
        onSubmit("__COMPLETE__:" + opts.slice(0, 8).join("  "));
        setTimeout(() => setVal(val), 0);
      }
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      const n = hi < 0 ? hist.length - 1 : Math.max(0, hi - 1);
      if (n >= 0) {
        setHi(n);
        setVal(hist[n]);
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (hi < 0) return;
      const n = hi + 1;
      if (n >= hist.length) {
        setHi(-1);
        setVal("");
      } else {
        setHi(n);
        setVal(hist[n]);
      }
    }
  };

  const completedCount = objetivos ? objetivos.filter((o) => done[o.id]).length : 0;
  const totalCount = objetivos ? objetivos.length : 0;

  // ——— rolagem horizontal da lista de tarefas ———
  const taskRail = useRef<HTMLDivElement>(null);

  const scrollTasks = (dir: -1 | 1) => {
    const el = taskRail.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(180, el.clientWidth * 0.6), behavior: "smooth" });
  };

  // A roleta do mouse é vertical por padrão: convertemos em rolagem horizontal aqui.
  const onTaskWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = taskRail.current;
    if (!el) return;
    if (el.scrollWidth <= el.clientWidth) return; // nada a rolar
    e.preventDefault();
    el.scrollLeft += (e.deltaY !== 0 ? e.deltaY : e.deltaX);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 max-w-full flex-col overflow-hidden">
      {/* PAINEL FIXO DE TAREFAS NO TOPO DO TERMINAL (SEMPRE VISÍVEL E IMUTÁVEL MESMO COM CLEAR/LOGS) */}
      {objetivos && objetivos.length > 0 && (
        <div className="z-20 w-full min-w-0 shrink-0 overflow-hidden border-b-2 border-phos/40 bg-[#06120e] px-2.5 py-2 shadow-[0_4px_16px_rgba(0,0,0,0.6)] sm:px-3">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-b border-hair pb-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <span className="led led-blink shrink-0 text-phos" />
              <span className="font-mono text-[10px] leading-tight font-bold break-words text-phos-lt uppercase tracking-wider sm:text-[11px] sm:tracking-widest">
                TAREFAS DE CONTENÇÃO DO SERVIDOR
              </span>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => scrollTasks(-1)}
                aria-label="rolar tarefas para a esquerda"
                title="Rolar tarefas ◂"
                className="chip border border-hair bg-[#0b1717] px-1.5 py-0.5 text-[10px] whitespace-nowrap text-slate hover:border-phos/60 hover:text-phos"
              >
                ◂
              </button>
              <button
                type="button"
                onClick={() => scrollTasks(1)}
                aria-label="rolar tarefas para a direita"
                title="Rolar tarefas ▸"
                className="chip border border-hair bg-[#0b1717] px-1.5 py-0.5 text-[10px] whitespace-nowrap text-slate hover:border-phos/60 hover:text-phos"
              >
                ▸
              </button>
              <span className="tabnum ml-1 border border-phos/50 bg-phos/15 px-2 py-0.5 font-mono text-[11px] font-bold whitespace-nowrap text-phos glow">
                {completedCount}/{totalCount} CONCLUÍDAS
              </span>
              {completedCount < totalCount && (
                <span
                  title="Tempo da tarefa em andamento — quanto mais rápido, maior a nota"
                  className={`tabnum border px-2 py-0.5 font-mono text-[11px] font-bold whitespace-nowrap ${
                    taskElapsed > 60
                      ? "border-alarm/60 bg-alarm/10 text-alarm"
                      : taskElapsed > 30
                        ? "border-amber/60 bg-amber/10 text-amber"
                        : "border-hair bg-[#0b1717] text-slate"
                  }`}
                >
                  ⏱ {taskElapsed.toFixed(1)}s
                </span>
              )}
              {completedCount === totalCount && (
                <span className="animate-pulse bg-phos/20 px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap text-phos">
                  SETOR SELADO!
                </span>
              )}
            </div>
          </div>

          {/* Lista com todas as tasks do nível atual (somente leitura, sem clique) */}
          <div
            ref={taskRail}
            onWheel={onTaskWheel}
            className="task-scroll mt-2 flex select-none gap-2 overflow-x-auto overscroll-x-contain pb-1.5"
            aria-hidden="false"
          >
            {objetivos.map((o, idx) => {
              const isDone = !!done[o.id];
              return (
                <div
                  key={o.id}
                  className={`flex shrink-0 items-center gap-2 border px-2.5 py-1.5 text-left ${
                    isDone
                      ? "border-phos/70 bg-phos/20 text-phos"
                      : "border-hair bg-[#0b1717] text-slate"
                  }`}
                  title={
                    isDone
                      ? `[CONCLUÍDA] ${o.titulo}`
                      : `[PENDENTE] ${o.titulo} — confirme via comando correto no terminal`
                  }
                >
                  <span
                    className={`tabnum font-mono text-[10px] font-bold px-1 py-0.2 ${
                      isDone ? "bg-phos text-[#04100c] font-black" : "text-amber"
                    }`}
                  >
                    {isDone ? "✓" : String(idx + 1).padStart(2, "0")}
                  </span>

                  <div className="flex min-w-0 flex-col">
                    <span
                      className={`text-[11.5px] font-semibold tracking-tight whitespace-nowrap ${
                        isDone ? "line-through text-phos/90" : "text-phos-lt"
                      }`}
                    >
                      {o.titulo}
                    </span>
                    {!isDone && (() => {
                      const progress = requirementProgress[o.id];
                      if (progress && progress.total > 1) {
                        return (
                          <span className="font-mono text-[9.5px] text-amber/90">
                            {progress.met}/{progress.total} requisitos atendidos
                          </span>
                        );
                      }
                      return (
                        <span className="font-mono text-[9.5px] text-slate2 truncate max-w-[220px]">
                          ▸ descubra e execute o comando
                        </span>
                      );
                    })()}
                    {isDone && taskTimes[o.id] !== undefined && (
                      <span className="font-mono text-[9.5px] text-phos/80">
                        {taskTimes[o.id]}s
                      </span>
                    )}
                  </div>

                  {isDone && (
                    <span className="ml-1 text-[9px] font-mono uppercase bg-phos/30 text-phos px-1.5 py-0.5 border border-phos/50 font-bold">
                      ✓ CONCLUÍDO
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ÁREA DO CRT / TERMINAL SCROLLER */}
      <div
        ref={scroller}
        onMouseDown={() => !busy && inp.current?.focus()}
        className="terminal-scroll crt flicker relative min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 py-3 sm:px-5 sm:py-4"
      >
        <div className="scanbar" />
        <div className="relative z-[2] font-mono text-[11.5px] leading-[1.55] sm:text-[13px] sm:leading-[1.6]">
          {shown.map((l, i) => (
            <div
              key={i}
              className={`whitespace-pre-wrap break-words ${TONE[l.tone] ?? TONE.out}`}
            >
              {l.t === "__CLEAR__" ? "" : l.t}
            </div>
          ))}
          {!busy && (
            <div className="mt-1 flex items-center gap-2 break-all">
              <span className="shrink-0 text-phos glow">{prompt}</span>
              <span className="min-h-[1.5em] min-w-0 flex-1 text-phos-lt glow whitespace-pre-wrap">
                {val || "\u00A0"}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* TECLADO FÍSICO DO RACK E CHIPS */}
      <div className="border-t border-hair bg-[#0b1013] px-2 pt-2 pb-[max(8px,env(safe-area-inset-bottom))] sm:px-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="silk">entrada</span>
          <div className="hairline flex-1" />
          <span className="silk silk-lt tabnum">{val.length.toString().padStart(3, "0")}</span>
        </div>
        <div className="flex min-w-0 items-stretch gap-2">
          <div className="module flex min-w-0 flex-1 items-center gap-2 overflow-hidden px-2 py-1.5">
            <span title={prompt} className="max-w-[38vw] shrink-0 truncate text-[10px] text-phos glow sm:max-w-none sm:text-[11px]">{prompt}</span>
            <input
              ref={inp}
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={onKey}
              disabled={busy}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              aria-label="linha de comando"
              placeholder={busy ? "…" : "digite um comando"}
              className="term-caret min-w-0 flex-1 bg-transparent text-[13px] text-phos-lt outline-none placeholder:text-slate2/60"
            />
            <button
              onClick={submit}
              disabled={busy}
              className="chip btn-slab shrink-0 border border-phos/40 bg-phos/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.22em] whitespace-nowrap text-phos disabled:opacity-30 sm:px-3"
            >
              EXEC ▸
            </button>
          </div>
        </div>
        <div
          onWheel={(e) => {
            const el = e.currentTarget;
            if (el.scrollWidth <= el.clientWidth) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
          }}
          className="task-scroll mt-2 flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain pb-1.5"
        >
          {chips.map((c) => (
            <button
              key={c}
              onClick={() => {
                inp.current?.focus();
                setVal(c);
              }}
              className="chip shrink-0 border border-hair bg-[#131b1f] px-2.5 py-1.5 text-[10.5px] whitespace-nowrap text-slate hover:border-phos/50 hover:bg-phos/10 hover:text-phos-lt"
            >
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
