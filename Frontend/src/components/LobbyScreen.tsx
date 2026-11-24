import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Mark, Silk } from "./Rack";
import { connectRealtime, type RealtimeClient } from "../realtime";
import { getRemainingSeconds, startPreciseClock } from "../game/clock";

const plate = "absolute inset-0 z-30 flex flex-col overflow-y-auto overscroll-contain no-scrollbar";
const wrap = "m-auto flex w-full max-w-[1240px] min-w-0 flex-col px-4 py-6 sm:px-8";

const LAB_KEY = "initium.lab.global";
const PLAYERS_KEY = "initium.lab.players";

export type LabStatus = "aguardando" | "em_andamento" | "finalizado";

export type LabState = {
  status: LabStatus;
  startTime?: number;
  durationSeconds: number;
  adminOperator?: string;
};

function now() {
  return Date.now();
}

function formatTempoRestante(segundos: number): string {
  const safe = Math.max(0, Math.floor(segundos));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function LobbyScreen({
  operatorName,
  onStartLab,
  onVoltar,
}: {
  operatorName: string;
  onStartLab: (state?: LabState) => void;
  onVoltar: () => void;
}) {
  const [lab, setLab] = useState<LabState>({
    status: "aguardando",
    durationSeconds: 90 * 60,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(now);

  const bc = useRef<BroadcastChannel | null>(null);
  const realtime = useRef<RealtimeClient | null>(null);

  useEffect(() => {
    const aplicarEstadoLaboratorio = (payload: LabState) => {
      setLab(payload);
    };

    try {
      const raw = localStorage.getItem(LAB_KEY);
      if (raw) aplicarEstadoLaboratorio(JSON.parse(raw) as LabState);
    } catch {}

    const channel = new BroadcastChannel("initium.lab");
    bc.current = channel;
    const realtimeClient = connectRealtime((message) => {
      if (message.type === "LAB_STATE") {
        const payload = message.payload as LabState;
        aplicarEstadoLaboratorio(payload);
        try {
          localStorage.setItem(LAB_KEY, JSON.stringify(payload));
        } catch {}
      }
    });
    realtime.current = realtimeClient;

    channel.onmessage = (event) => {
      const { type, payload } = event.data ?? {};
      if (type === "LAB_STATE") {
        aplicarEstadoLaboratorio(payload);
        try {
          localStorage.setItem(LAB_KEY, JSON.stringify(payload));
        } catch {}
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== LAB_KEY || !event.newValue) return;
      try {
        aplicarEstadoLaboratorio(JSON.parse(event.newValue) as LabState);
      } catch {}
    };
    window.addEventListener("storage", onStorage);

    return () => {
      channel.close();
      realtimeClient.close();
      realtime.current = null;
      window.removeEventListener("storage", onStorage);
      bc.current = null;
    };
  }, []);

  useEffect(() => {
    return startPreciseClock(setClockNow);
  }, []);

  useEffect(() => {
    const id = `player-${now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const raw = localStorage.getItem(PLAYERS_KEY);
      const players: any[] = raw ? JSON.parse(raw) : [];
      const existente = players.find((p: any) => p.nome === operatorName);
      const atualizado = existente
        ? players.map((p: any) => (p.nome === operatorName ? { ...p, online: true, ultimaAtualizacao: now() } : p))
        : [...players, {
            id,
            nome: operatorName,
            score: 0,
            fase: 0,
            ultimaAtualizacao: now(),
            online: true,
            tasksConcluidas: 0,
            integridade: 100,
            tempoRestante: 90 * 60,
            penalidades: 0,
            registradoEm: now(),
          }];
      localStorage.setItem(PLAYERS_KEY, JSON.stringify(atualizado));
      bc.current?.postMessage({ type: "PLAYERS_UPDATE", payload: atualizado });
      realtime.current?.send({
        type: "PLAYER_UPSERT",
        payload: atualizado.find((player: any) => player.nome === operatorName),
      });
    } catch {}
  }, [operatorName]);

  useEffect(() => {
    if (lab.status === "em_andamento") {
      onStartLab(lab);
    }
  }, [lab.status, onStartLab]);

  const tempoRestante =
    lab.status === "em_andamento"
      ? getRemainingSeconds(lab.startTime, lab.durationSeconds, Math.max(clockNow, now()))
      : lab.durationSeconds;

  return (
    <div className={`${plate} bg-chassis/97 backdrop-blur-[2px]`}>
      <div className={wrap}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Mark className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <Silk>sala de espera · laboratório nacional</Silk>
          </div>
          <div className="hairline hidden min-w-[32px] flex-1 sm:block" />
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 14, scaleY: 0.86 }}
          animate={{ opacity: 1, y: 0, scaleY: 1 }}
          transition={{ duration: 0.5 }}
          className="disp mt-5 w-full text-[clamp(44px,15vw,140px)] break-words text-phos glow"
        >
          LOBBY
        </motion.h1>

        <div className="mt-6 min-w-0 max-w-[560px]">
          <div className="module relative px-4 py-4 mb-6">
            <Silk>operador</Silk>
            <div className="mt-1 disp tabnum text-[clamp(20px,6vw,32px)] leading-none text-phos-lt glow">
              {operatorName}
            </div>
          </div>

          <div className="module relative px-4 py-4 mb-6">
            <Silk>status do desafio</Silk>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  lab.status === "em_andamento" ? "bg-phos" : "bg-slate2"
                }`}
              />
              <span className={`text-[12px] font-bold tracking-[0.2em] ${
                lab.status === "em_andamento"
                  ? "text-phos glow"
                  : "text-slate"
              }`}>
                {lab.status === "em_andamento" ? "EM ANDAMENTO" : "AGUARDANDO INÍCIO DO ADMINISTRADOR"}
              </span>
            </div>
          </div>

          {lab.status === "aguardando" && (
            <div className="module relative px-4 py-4 mb-6 border border-phos/30 bg-phos/5">
              <Silk>cronômetro global</Silk>
              <div className="mt-2 disp tabnum text-[clamp(32px,9vw,56px)] leading-none text-phos glow">
                {formatTempoRestante(tempoRestante)}
              </div>
              <div className="mt-1 silk text-[10px] text-slate2">
                O contador inicia quando o administrador liberar o laboratório.
              </div>
            </div>
          )}

          {lab.status === "em_andamento" && (
            <div className="module relative px-4 py-4 mb-6 border border-alarm/30 bg-alarm/5">
              <Silk>tempo restante</Silk>
              <div className="mt-2 disp tabnum text-[clamp(32px,9vw,56px)] leading-none text-alarm glow">
                {formatTempoRestante(tempoRestante)}
              </div>
              <div className="mt-1 silk text-[10px] text-alarm">
                O desafio começou! Acesse o console para iniciar a contenção.
              </div>
            </div>
          )}

          {msg && (
            <div className="mb-4 border border-alarm/60 bg-alarm/10 px-3 py-2 text-center text-[11px] font-bold break-words text-alarm">
              {msg}
            </div>
          )}

          {lab.status === "aguardando" && (
            <div className="text-center">
              <p className="text-[11px] text-slate2 mb-4">
                Aguardando o administrador iniciar o laboratório. Você será notificado automaticamente quando o desafio começar.
              </p>
              <button
                onClick={onVoltar}
                className="btn-slab w-full min-w-0 overflow-hidden border border-hair bg-panel2 px-4 py-3.5 text-left text-slate hover:border-phos/50 hover:text-phos-lt sm:px-5"
              >
                <span className="disp block text-[15px] leading-tight break-words sm:text-[16px]">
                  VOLTAR AO MENU PRINCIPAL
                </span>
              </button>
            </div>
          )}

          {lab.status === "em_andamento" && (
            <div className="text-center">
              <button
                onClick={() => onStartLab(lab)}
                className="btn-slab w-full min-w-0 overflow-hidden border-2 border-phos bg-phos/20 px-4 py-5 text-left text-phos hover:bg-phos/30 shadow-[0_0_20px_rgba(57,255,136,0.2)] sm:px-6"
              >
                <span className="disp block text-[clamp(17px,4.5vw,26px)] leading-tight break-words">
                  ABRIR CONSOLE TÁTICO
                </span>
                <span className="silk mt-1 block">enter · iniciar missão</span>
              </button>
            </div>
          )}
        </div>

        <div className="mt-6 border-t border-hair pt-3 text-center text-[10px] text-slate2 break-words">
          INITIUM · acesso restrito a personnel autorizado do CSIRT Nacional
        </div>
      </div>
    </div>
  );
}
