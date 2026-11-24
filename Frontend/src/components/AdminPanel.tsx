import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Mark, Silk } from "./Rack";
import { loadScores, type Score } from "./Overlays";
import { connectRealtime, type RealtimeClient } from "../realtime";
import { getRemainingSeconds, startPreciseClock } from "../game/clock";

const plate = "absolute inset-0 z-30 flex flex-col overflow-y-auto overscroll-contain no-scrollbar";
const wrap = "m-auto flex w-full max-w-[1240px] min-w-0 flex-col px-4 py-6 sm:px-8";

const LAB_KEY = "initium.lab.global";
const PLAYERS_KEY = "initium.lab.players";
const ADMIN_SESSION_KEY = "initium.admin.session";

export type LabStatus = "aguardando" | "em_andamento" | "finalizado";

export type LabState = {
  status: LabStatus;
  startTime?: number;
  durationSeconds: number;
  adminOperator?: string;
};

export type PlayerRecord = {
  id: string;
  nome: string;
  score: number;
  fase: number;
  ultimaAtualizacao: number;
  online: boolean;
  tasksConcluidas?: number;
  integridade?: number;
  tempoRestante?: number;
  penalidades?: number;
  registradoEm?: number;
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

export function AdminPanel({
  onVoltar,
}: {
  onVoltar: () => void;
}) {
  const [lab, setLab] = useState<LabState>({
    status: "aguardando",
    durationSeconds: 90 * 60,
  });
  const [players, setPlayers] = useState<PlayerRecord[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [adminSenha, setAdminSenha] = useState("");
  const [autenticadoAdmin, setAutenticadoAdmin] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_SESSION_KEY) === "authenticated";
    } catch {
      return false;
    }
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [clockNow, setClockNow] = useState(now);

  const bc = useRef<BroadcastChannel | null>(null);
  const realtime = useRef<RealtimeClient | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAB_KEY);
      if (raw) setLab(JSON.parse(raw) as LabState);
    } catch {}

    try {
      const raw = localStorage.getItem(PLAYERS_KEY);
      if (raw) setPlayers(JSON.parse(raw) as PlayerRecord[]);
    } catch {}

    setScores(loadScores());

    const channel = new BroadcastChannel("initium.lab");
    bc.current = channel;
    const realtimeClient = connectRealtime((message) => {
      if (message.type === "LAB_STATE") setLab(message.payload as LabState);
      if (message.type === "PLAYERS_UPDATE") setPlayers(message.payload as PlayerRecord[]);
      if (message.type === "SCORES_UPDATE") setScores(message.payload as Score[]);
    });
    realtime.current = realtimeClient;

    channel.onmessage = (event) => {
      const { type, payload } = event.data ?? {};
      if (type === "LAB_STATE") {
        setLab(payload);
        try {
          localStorage.setItem(LAB_KEY, JSON.stringify(payload));
        } catch {}
      }
      if (type === "PLAYERS_UPDATE") {
        setPlayers(payload);
        try {
          localStorage.setItem(PLAYERS_KEY, JSON.stringify(payload));
        } catch {}
      }
      if (type === "SCORES_UPDATE") {
        setScores(payload);
      }
    };

    return () => {
      channel.close();
      realtimeClient.close();
      realtime.current = null;
      bc.current = null;
    };
  }, []);

  useEffect(() => {
    return startPreciseClock(setClockNow);
  }, []);

  useEffect(() => {
    if (lab.status !== "em_andamento" || !lab.startTime) return;
    const id = setInterval(() => {
      const agora = now();
      const decorrido = Math.floor((agora - lab.startTime) / 1000);
      const restante = Math.max(0, lab.durationSeconds - decorrido);
      if (restante <= 0) {
        setLab((prev) => ({ ...prev, status: "finalizado" }));
        try {
          localStorage.setItem(LAB_KEY, JSON.stringify({ ...prev, status: "finalizado" }));
        } catch {}
        bc.current?.postMessage({ type: "LAB_STATE", payload: { ...prev, status: "finalizado" } });
        realtime.current?.send({ type: "LAB_COMMAND", payload: { action: "finish" } });
        clearInterval(id);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lab.status, lab.startTime, lab.durationSeconds]);

  const salvarLab = useCallback((estado: LabState) => {
    realtime.current?.send({
      type: "LAB_COMMAND",
      payload: estado.status === "em_andamento"
        ? { action: "start", durationSeconds: estado.durationSeconds, adminOperator: estado.adminOperator }
        : { action: "reset" },
    });
    try {
      localStorage.setItem(LAB_KEY, JSON.stringify(estado));
    } catch {}
    bc.current?.postMessage({ type: "LAB_STATE", payload: estado });
    realtime.current?.send({ type: "LAB_STATE", payload: estado });
  }, []);

  const registrarJogador = useCallback((nome: string, score: number, fase: number) => {
    const id = `player-${now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rec: PlayerRecord = {
      id,
      nome,
      score,
      fase,
      ultimaAtualizacao: now(),
      online: true,
    };
    setPlayers((prev) => {
      const existente = prev.find((p) => p.nome === nome);
      const atualizado = existente
        ? prev.map((p) => (p.nome === nome ? { ...rec, id: p.id } : p))
        : [...prev, rec];
      try {
        localStorage.setItem(PLAYERS_KEY, JSON.stringify(atualizado));
      } catch {}
      bc.current?.postMessage({ type: "PLAYERS_UPDATE", payload: atualizado });
      realtime.current?.send({
        type: "PLAYER_UPSERT",
        payload: atualizado.find((player) => player.nome === nome),
      });
      return atualizado;
    });
  }, []);

  const handleStart = () => {
    if (lab.status === "em_andamento") {
      setMsg("O laboratório já está em andamento.");
      return;
    }
    const estado: LabState = {
      status: "em_andamento",
      startTime: now(),
      durationSeconds: lab.durationSeconds,
      adminOperator: adminSenha || "ADMIN",
    };
    salvarLab(estado);
    setMsg("Laboratório iniciado! Todos os jogadores foram notificados.");
    setTimeout(() => setMsg(null), 3000);
  };

  const handleReset = () => {
    const estado: LabState = {
      status: "aguardando",
      durationSeconds: lab.durationSeconds,
    };
    salvarLab(estado);
    setPlayers([]);
    try {
      localStorage.removeItem(PLAYERS_KEY);
    } catch {}
    bc.current?.postMessage({ type: "PLAYERS_UPDATE", payload: [] });
    realtime.current?.send({ type: "PLAYERS_RESET", payload: null });
    setMsg("Laboratório resetado. Aguardando início do administrador.");
    setTimeout(() => setMsg(null), 3000);
  };

  const handleLoginAdmin = () => {
    if (adminSenha === "admin") {
      setAutenticadoAdmin(true);
      try {
        localStorage.setItem(ADMIN_SESSION_KEY, "authenticated");
      } catch {}
      setMsg(null);
    } else {
      setMsg("Senha de administrador incorreta.");
    }
  };

  const handleLogoutAdmin = () => {
    try {
      localStorage.removeItem(ADMIN_SESSION_KEY);
    } catch {}
    setAutenticadoAdmin(false);
    setAdminSenha("");
    setMsg(null);
  };

  const tempoRestante =
    lab.status === "em_andamento"
      ? getRemainingSeconds(lab.startTime, lab.durationSeconds, Math.max(clockNow, now()))
      : lab.durationSeconds;

  const jogadoresOrdenados = [...players].sort((a, b) => b.score - a.score);
  const scoresOrdenados = [...scores].sort((a, b) => b.pts - a.pts);

  const handleExportLogs = useCallback(() => {
    const participantes = jogadoresOrdenados.map((player, index) => ({
      posicao: index + 1,
      participante: player.nome,
      score: player.score,
      tasksConcluidas: player.tasksConcluidas ?? 0,
      integridade: player.integridade ?? null,
      tempoRestanteSegundos: player.tempoRestante ?? null,
      penalidades: player.penalidades ?? 0,
      primeiroRegistro: player.registradoEm
        ? new Date(player.registradoEm).toISOString()
        : null,
      online: player.online,
      ultimaAtualizacao: new Date(player.ultimaAtualizacao).toISOString(),
    }));
    const log = {
      tipo: "INITIUM_CTF_PARTICIPANT_LOGS",
      geradoEm: new Date().toISOString(),
      laboratorio: {
        status: lab.status,
        startTime: lab.startTime ?? null,
        durationSeconds: lab.durationSeconds,
      },
      criteriosDesempate: [
        "maior número de tasks concluídas",
        "maior integridade restante",
        "maior tempo restante",
        "menor quantidade de penalidades",
        "primeiro registro confirmado pelo servidor",
      ],
      participantes,
    };
    const blob = new Blob([JSON.stringify(log, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `initium-logs-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setMsg(`Logs exportados para ${participantes.length} participante(s).`);
    setTimeout(() => setMsg(null), 3000);
  }, [jogadoresOrdenados, lab]);

  if (!autenticadoAdmin) {
    return (
      <div className={`${plate} items-center bg-chassis/97 backdrop-blur-[2px]`}>
        <div className={`${wrap} items-center`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Mark className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <Silk>painel administrativo · autenticação</Silk>
            </div>
            <div className="hairline hidden min-w-[32px] flex-1 sm:block" />
          </div>

          <motion.h1
            initial={{ opacity: 0, y: 14, scaleY: 0.86 }}
            animate={{ opacity: 1, y: 0, scaleY: 1 }}
            transition={{ duration: 0.5 }}
            className="disp mt-5 w-full text-center text-[clamp(44px,15vw,140px)] break-words text-phos glow"
          >
            ADMIN
          </motion.h1>

          <div className="mt-6 w-full min-w-0 max-w-[420px]">
            {msg && (
              <div className="mb-4 border border-alarm/60 bg-alarm/10 px-3 py-2 text-center text-[11px] font-bold break-words text-alarm">
                {msg}
              </div>
            )}

            <div>
              <Silk>senha de administrador</Silk>
              <input
                type="password"
                autoComplete="current-password"
                value={adminSenha}
                onChange={(e) => setAdminSenha(e.target.value)}
                placeholder="••••••"
                className="module w-full px-3 py-3 text-center text-[16px] tracking-[0.2em] text-phos placeholder:text-slate2/60 outline-none mt-2"
              />
            </div>

            <button
              onClick={handleLoginAdmin}
              className="btn-slab w-full min-w-0 overflow-hidden border-2 border-phos bg-phos/20 px-4 py-5 text-left text-phos hover:bg-phos/30 shadow-[0_0_20px_rgba(57,255,136,0.2)] mt-6 sm:px-6"
            >
              <span className="disp block text-[clamp(17px,4.5vw,26px)] leading-tight break-words">
                AUTENTICAR ADMINISTRADOR
              </span>
              <span className="silk mt-1 block">enter</span>
            </button>

            <button
              onClick={onVoltar}
              className="btn-slab mt-3 w-full min-w-0 overflow-hidden border border-hair bg-panel2 px-4 py-3.5 text-left text-slate hover:border-phos/50 hover:text-phos-lt sm:px-5"
            >
              <span className="disp block text-[15px] leading-tight break-words sm:text-[16px]">VOLTAR AO MENU</span>
            </button>

            <div className="mt-6 border-t border-hair pt-3 text-center text-[10px] text-slate2 break-words">
              INITIUM — painel restrito a administradores do CSIRT Nacional
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={`${plate} bg-chassis/97 backdrop-blur-[2px]`}>
      <div className={wrap}>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="flex items-center gap-x-3">
            <Mark className="h-9 w-9 shrink-0" />
            <div className="min-w-0">
              <Silk>painel administrativo · laboratório nacional</Silk>
            </div>
            <div className="hairline hidden min-w-[32px] flex-1 sm:block" />
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              onClick={handleLogoutAdmin}
              className="btn-slab shrink-0 overflow-hidden border border-alarm/60 bg-alarm/10 px-4 py-3.5 text-left text-alarm hover:bg-alarm/20 sm:px-5"
            >
              <span className="disp block text-[14px] leading-tight break-words sm:text-[15px]">LOGOUT</span>
            </button>
            <button
              onClick={onVoltar}
              className="btn-slab shrink-0 overflow-hidden border border-hair bg-panel2 px-4 py-3.5 text-left text-slate hover:border-phos/50 hover:text-phos-lt sm:px-5"
            >
              <span className="disp block text-[14px] leading-tight break-words sm:text-[15px]">VOLTAR</span>
            </button>
          </div>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 14, scaleY: 0.86 }}
          animate={{ opacity: 1, y: 0, scaleY: 1 }}
          transition={{ duration: 0.5 }}
          className="disp mt-5 w-full text-[clamp(34px,11vw,100px)] break-words text-phos glow"
        >
          CONTROLE DO LABORATÓRIO
        </motion.h1>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="module relative px-4 py-4">
            <Silk>status do laboratório</Silk>
            <div className="mt-2 flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full animate-pulse ${
                  lab.status === "em_andamento" ? "bg-phos" : "bg-slate2"
                }`}
              />
              <span className={`text-[12px] font-bold tracking-[0.2em] ${
                lab.status === "em_andamento"
                  ? "text-phos glow"
                  : lab.status === "finalizado"
                    ? "text-alarm"
                    : "text-slate"
              }`}>
                {lab.status === "em_andamento" ? "EM ANDAMENTO" : lab.status === "finalizado" ? "FINALIZADO" : "AGUARDANDO INÍCIO"}
              </span>
            </div>
          </div>

          <div className="module relative px-4 py-4">
            <Silk>cronômetro global</Silk>
            <div className="mt-2 disp tabnum text-[clamp(28px,8vw,48px)] leading-none text-phos glow">
              {formatTempoRestante(tempoRestante)}
            </div>
            <div className="mt-1 silk text-[10px] text-slate2">
              {lab.status === "em_andamento"
                ? `Iniciado às ${new Date(lab.startTime!).toLocaleTimeString("pt-BR")}`
                : "Aguardando comando do administrador"}
            </div>
          </div>

          <div className="module relative px-4 py-4">
            <Silk>jogadores online</Silk>
            <div className="mt-2 disp tabnum text-[clamp(28px,8vw,48px)] leading-none text-phos-lt glow">
              {players.filter((p) => p.online).length}
            </div>
            <div className="mt-1 silk text-[10px] text-slate2">
              {players.length} registro(s) no banco
            </div>
          </div>
        </div>

        {msg && (
          <div className="mt-4 border border-phos/60 bg-phos/10 px-3 py-2 text-center text-[11px] font-bold break-words text-phos">
            {msg}
          </div>
        )}
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <button
            onClick={handleStart}
            disabled={lab.status === "em_andamento"}
            className={`btn-slab min-w-0 overflow-hidden border-2 ${
              lab.status === "em_andamento"
                ? "border-slate bg-slate/20 text-slate disabled:opacity-50"
                : "border-phos bg-phos/20 text-phos hover:bg-phos/30 shadow-[0_0_20px_rgba(57,255,136,0.2)]"
            } px-4 py-5 text-left sm:px-6`}
          >
            <span className="disp block text-[clamp(17px,4.5vw,26px)] leading-tight break-words">
              {lab.status === "em_andamento" ? "JÁ EM ANDAMENTO" : "INICIAR LABORATÓRIO"}
            </span>
            <span className="silk mt-1 block">
              {lab.status === "em_andamento" ? "Aguarde o término" : "Todos os jogadores iniciam simultaneamente"}
            </span>
          </button>

          <button
            onClick={handleReset}
            className="btn-slab min-w-0 overflow-hidden border border-alarm/60 bg-alarm/10 px-4 py-5 text-left text-alarm hover:bg-alarm/20 sm:px-6"
          >
            <span className="disp block text-[clamp(17px,4.5vw,26px)] leading-tight break-words">
              RESETAR LABORATÓRIO
            </span>
            <span className="silk mt-1 block">zerar progresso e status</span>
          </button>

          <button
            onClick={handleExportLogs}
            className="btn-slab min-w-0 overflow-hidden border border-amber/60 bg-amber/10 px-4 py-5 text-left text-amber hover:bg-amber/20 sm:px-6"
          >
            <span className="disp block text-[clamp(17px,4.5vw,26px)] leading-tight break-words">
              EXPORTAR LOGS
            </span>
            <span className="silk mt-1 block">dados individuais do ranking</span>
          </button>
        </div>

        <div className="mt-10 min-w-0">
          <div className="module relative min-w-0 overflow-hidden px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              <Silk lit>ranking em tempo real</Silk>
              <span className="tabnum text-[10px] text-slate2">{jogadoresOrdenados.length} jogador(es)</span>
            </div>

            <div className="mt-3 min-w-0">
              <div className="silk grid grid-cols-[24px_minmax(0,1fr)_72px_44px_64px] gap-2 pb-1.5 sm:grid-cols-[28px_minmax(0,1fr)_88px_52px_72px]">
                <span>#</span>
                <span className="min-w-0 truncate">operador</span>
                <span className="text-right whitespace-nowrap">pontos</span>
                <span className="text-right whitespace-nowrap">fase</span>
                <span className="text-right whitespace-nowrap">status</span>
              </div>

              {jogadoresOrdenados.length === 0 && (
                <div className="border-t border-hair py-6 text-center text-[11px] break-words text-slate2">
                  nenhum jogador registrado ainda
                </div>
              )}

              {jogadoresOrdenados.map((p, i) => (
                <div
                  key={p.id}
                  className={`tabnum grid grid-cols-[24px_minmax(0,1fr)_72px_44px_64px] gap-2 border-t border-hair py-1.5 text-[12px] sm:grid-cols-[28px_minmax(0,1fr)_88px_52px_72px] ${
                    p.online ? "text-phos-lt" : "text-slate2"
                  }`}
                >
                  <span className="text-slate2">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 truncate font-bold tracking-[0.18em]">{p.nome}</span>
                  <span className="text-right whitespace-nowrap">{p.score.toLocaleString("pt-BR")}</span>
                  <span className="text-right whitespace-nowrap text-slate2">{String(p.fase).padStart(2, "0")}</span>
                  <span className="text-right whitespace-nowrap">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        p.online ? "bg-phos/10 text-phos border border-phos/30" : "bg-slate2/30 text-slate border border-slate2/50"
                      }`}
                    >
                      {p.online ? "ONLINE" : "OFFLINE"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-8 min-w-0">
          <div className="module relative min-w-0 overflow-hidden px-4 py-4">
            <Silk lit>recordes históricos · top 08</Silk>
            <div className="mt-3 min-w-0">
              <div className="silk grid grid-cols-[24px_minmax(0,1fr)_72px_44px] gap-2 pb-1.5 sm:grid-cols-[28px_minmax(0,1fr)_88px_52px]">
                <span>#</span>
                <span className="min-w-0 truncate">codinome</span>
                <span className="text-right whitespace-nowrap">pontos</span>
                <span className="text-right whitespace-nowrap">faixa</span>
              </div>

              {scoresOrdenados.length === 0 && (
                <div className="border-t border-hair py-4 text-center text-[11px] break-words text-slate2">
                  nenhum recorde registrado
                </div>
              )}

              {scoresOrdenados.slice(0, 8).map((s, i) => (
                <div
                  key={i}
                  className={`tabnum grid grid-cols-[24px_minmax(0,1fr)_72px_44px] gap-2 border-t border-hair py-1.5 text-[12px] sm:grid-cols-[28px_minmax(0,1fr)_88px_52px] ${
                    i < 3 ? "text-phos-lt" : "text-slate"
                  }`}
                >
                  <span className="text-slate2">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 truncate font-bold tracking-[0.18em]">{s.nome}</span>
                  <span className="text-right whitespace-nowrap">{s.pts.toLocaleString("pt-BR")}</span>
                  <span className="text-right whitespace-nowrap text-slate2">{String(s.faixa).padStart(2, "0")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 border-t border-hair pt-3 text-center text-[10px] text-slate2 break-words">
          INITIUM · painel administrativo · CSIRT Nacional
        </div>
      </div>
    </div>
  );
}
