import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  GLOBAL_TIME_BUDGET,
  getObjectiveStatus,
  LEVELS,
  makeWorld,
  type ObjectiveStatus,
  type World,
} from "./game/model";
import { complete as shellComplete, exec, type Line } from "./game/shell";
import ParticleField, { type ParticleHandle } from "./components/ParticleField";
import Terminal from "./components/Terminal";
import { Bargraph, Mark, SystemLogFeed, Silk } from "./components/Rack";
import { LoginScreen } from "./components/LoginScreen";
import { AdminPanel, type LabState } from "./components/AdminPanel";
import { LobbyScreen } from "./components/LobbyScreen";
import {
  Briefing,
  EndPlate,
  Flash,
  MissionSelectorModal,
  PausePlate,
  TitleScreen,
} from "./components/Overlays";
import { loadGameSave, saveGameProgress, type SaveData } from "./game/save";
import {
  evaluateLevelPerformance,
  evaluateTaskPerformance,
  formatClock,
  type LevelScoreBreakdown,
} from "./game/scoring";
import { connectRealtime, type RealtimeClient } from "./realtime";

type Phase = "login" | "lobby" | "admin" | "title" | "briefing" | "play" | "pause" | "over" | "victory";
type Ev = { t: string; tone: string };
type RequirementProgress = Record<string, { met: number; total: number }>;

const MTerminal = memo(Terminal);
const MSystemLog = memo(SystemLogFeed);

const EVENTOS = [
  "ids.alerta — varredura de portas vinda do vetor externo",
  "ids.alerta — tentativa de força bruta no sshd",
  "roteador.borda — pacotes com TTL suspeito descartados",
  "ids.alerta — beacon HTTP periódico detectado",
  "soc — nova assinatura de malware correlacionada",
  "ids.alerta — tentativa de escalada de privilégio",
  "núcleo — carga de CPU acima do limiar operacional",
  "ids.scada — pacote fora do protocolo padrão industrial",
  "c2.sensor — eco de telemetria suspeita interceptado",
  "firewall — regra de contenção dinâmica aplicada com sucesso",
];

export default function App() {
  const adminRoute = window.location.pathname === "/admin";
  // O save é carregado uma única vez antes da criação do estado da sessão.
  // Assim, um refresh não recria o jogador com pontuação/relógio zerados.
  const [initialSave] = useState<SaveData | null>(() => loadGameSave());
  const initialLevelIndex = Math.min(
    LEVELS.length - 1,
    Math.max(0, initialSave?.currentLevelIndex ?? 0),
  );
  const initialScore = Math.max(0, initialSave?.score ?? 0);
  const initialClock = initialSave?.globalClockRemaining ?? GLOBAL_TIME_BUDGET;
  const initialIntegrity = initialSave?.integrityRemaining ?? 100;
  const [phase, setPhase] = useState<Phase>(() => {
    if (adminRoute) return "admin";
    try {
      const raw = localStorage.getItem("initium.auth.user");
      const data = raw ? JSON.parse(raw) : null;
      if (data?.authenticated && data.operatorName) return "lobby";
    } catch {}
    return "login";
  });
  const [li, setLi] = useState(initialLevelIndex);
  const [operatorName, setOperatorName] = useState("");
  const [labState, setLabState] = useState<LabState>({
    status: "aguardando",
    durationSeconds: 90 * 60,
  });
  const lv = LEVELS[li] || LEVELS[0];

  const [lines, setLines] = useState<Line[]>([]);
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [requirementProgress, setRequirementProgress] = useState<RequirementProgress>({});
  /** segundos gastos em cada tarefa já concluída (painel + relatório) */
  const [taskTimes, setTaskTimes] = useState<Record<string, number>>({});
  /** espelho em ref do taskTimes — legível dentro de callbacks do mesmo tick */
  const taskTimesRef = useRef<Record<string, number>>({});
  const [events, setEvents] = useState<Ev[]>([]);
  const [hud, setHud] = useState({
    integ: initialIntegrity,
    globalClock: initialClock,
    combo: 1,
    score: initialScore,
  });
  /** cronômetro corrente da tarefa em andamento, em segundos */
  const [taskElapsed, setTaskElapsed] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [focusHack, setFocusHack] = useState(0);
  const [chan, setChan] = useState<"console" | "quadro">("console");
  const [pwr, setPwr] = useState(0);
  const [finalFaixa, setFinalFaixa] = useState(1);
  const [pop, setPop] = useState<{ t: string; k: number } | null>(null);
  const [lastGrade, setLastGrade] = useState<LevelScoreBreakdown | null>(null);

  // Sistema de salvamento e seleção de fases
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [unlockedIndices, setUnlockedIndices] = useState<number[]>([0]);
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [saveNotice, setSaveNotice] = useState(false);

  const world = useRef<World>(makeWorld(LEVELS[initialLevelIndex]));
  const g = useRef({
    integ: initialIntegrity,
    globalClock: initialClock,
    combo: 1,
    score: initialScore,
    lastTask: 0,
    crit: false,
    over: false,
    levelStartTime: 0,
    phaseObjectiveScore: 0,
    /** timestamp (performance.now) do início da tarefa em andamento */
    taskStartAt: 0,
    /** soma dos pontos obtidos nas tarefas desta fase */
    taskScore: 0,
    /** pontos a descontar da tarefa em andamento (dicas, erros, colateral) */
    taskPenalty: 0,
    /** penalidade acumulada além do desgaste temporal global */
    integrityPenalty: 0,
    tasksCompleted: 0,
    penaltyCount: 0,
    failed: false,
  });
  const parts = useRef<ParticleHandle>(null);
  const realtime = useRef<RealtimeClient | null>(null);

  // Carregar dados salvos ao iniciar
  useEffect(() => {
    const saved = initialSave;
    if (saved) {
      setUnlockedIndices(saved.unlockedLevelIndices || [0]);
      setCompletedIndices(saved.completedLevelIndices || []);
    }
  }, []);

  // Carregar estado de autenticação e laboratório ao iniciar
  useEffect(() => {
    const aplicarEstadoLaboratorio = (payload: LabState) => {
      setLabState(payload);
    };

    try {
      const raw = localStorage.getItem("initium.auth.user");
      if (raw) {
        const data = JSON.parse(raw);
        if (data.authenticated && data.operatorName) {
          setOperatorName(data.operatorName);
          setPhase("lobby");
        }
      }
    } catch {}

    try {
      const rawLab = localStorage.getItem("initium.lab.global");
      if (rawLab) {
        const lab = JSON.parse(rawLab) as LabState;
        aplicarEstadoLaboratorio(lab);
      }
    } catch {}

    // Ouvir mudanças do laboratório em tempo real (admin inicia/reseta)
    const labChannel = new BroadcastChannel("initium.lab");
    const realtimeClient = connectRealtime((message) => {
      if (message.type !== "LAB_STATE") return;
      const payload = message.payload as LabState;
      aplicarEstadoLaboratorio(payload);
      try {
        localStorage.setItem("initium.lab.global", JSON.stringify(payload));
      } catch {}
    });
    realtime.current = realtimeClient;
    labChannel.onmessage = (event) => {
      const { type, payload } = event.data ?? {};
      if (type === "LAB_STATE") {
        aplicarEstadoLaboratorio(payload);
        try {
          localStorage.setItem("initium.lab.global", JSON.stringify(payload));
        } catch {}
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== "initium.lab.global" || !event.newValue) return;
      try {
        aplicarEstadoLaboratorio(JSON.parse(event.newValue) as LabState);
      } catch {}
    };
    window.addEventListener("storage", onStorage);
    return () => {
      labChannel.close();
      realtimeClient.close();
      realtime.current = null;
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const prompt = useMemo(() => {
    const host = lv.alvo.split(".")[0];
    const cwd = world.current.cwd === "/root" ? "~" : world.current.cwd;
    return `root@${host}:${cwd}#`;
  }, [lv, lines]);

  const chips = useMemo(() => {
    // Somente comandos-base de navegação/investigação — nunca a resposta pronta.
    return [
      "ajuda", "dica", "ps aux", "netstat -tulpn", "ss -tulpn", "ls -la",
      "ls -la /tmp", "tail -n 20 /var/log/auth.log", "grep 'Failed password' /var/log/auth.log",
      "chkrootkit", "iptables -L -n", "whois", "cat /etc/ssh/sshd_config",
    ];
  }, []);

  const say = useCallback((t: string, tone = "dim") => setEvents((e) => [...e, { t, tone }].slice(-40)), []);
  const doComplete = useCallback((cur: string) => shellComplete(world.current, cur), []);

  const resetLevel = useCallback((
    idx: number,
    opts: { score?: number; freshCampaign?: boolean; globalClock?: number; integrity?: number } = {},
  ) => {
    const L = LEVELS[idx] || LEVELS[0];
    const prev = g.current;
    const keep = opts.score !== undefined ? opts.score : prev.score;
    // O contador global NÃO reinicia ao trocar de fase: só um novo início de
    // campanha (ou um reinício após falha) abre uma nova janela de operação.
    const globalClock = opts.freshCampaign
      ? GLOBAL_TIME_BUDGET
      : opts.globalClock !== undefined ? opts.globalClock : prev.globalClock;
    const integrity = opts.freshCampaign
      ? 100
      : opts.integrity !== undefined ? opts.integrity : prev.integ;
    world.current = makeWorld(L);
    setRequirementProgress(Object.fromEntries(
      L.objetivos.map((objective) => {
        const status = getObjectiveStatus(objective, world.current);
        return [objective.id, { met: status.requirementsMet, total: status.requirementsTotal }];
      })
    ));
    g.current = {
      integ: integrity,
      globalClock,
      combo: 1,
      score: keep,
      lastTask: 0,
      crit: false,
      over: false,
      levelStartTime: performance.now(),
      phaseObjectiveScore: 0,
      // o relógio não para no briefing: cronômetros já começam a contar
      taskStartAt: performance.now(),
      taskScore: 0,
      taskPenalty: 0,
      integrityPenalty: Math.max(0, (100 - integrity) - 100 * (1 - globalClock / GLOBAL_TIME_BUDGET)),
      tasksCompleted: prev.tasksCompleted,
      penaltyCount: prev.penaltyCount,
      failed: false,
    };
    setTaskTimes({});
    taskTimesRef.current = {};
    setTaskElapsed(0);
    setLines([
      { t: `INITIUM // CONSOLE SEGURA — SESSÃO AUDITADA · CLEARANCE NÍVEL IV`, tone: "dim" },
      { t: `INCIDENTE ${String(L.id).padStart(2, "0")}/${String(LEVELS.length).padStart(2, "0")} · ${L.setor}`, tone: "dim" },
      { t: `Conectado a ${L.alvo} (${L.ip}). Contador único de operação: ${formatClock(globalClock)} restantes para toda a campanha.`, tone: "out" },
      { t: `${L.objetivos.length} vetores de contenção aguardando identificação. Use o painel fixo de tarefas no topo para acompanhar o progresso.`, tone: "dim" },
      { t: `Dica: comece mapeando com 'ps aux', 'netstat -tulpn' ou 'nmap -sV localhost'.`, tone: "dim" },
      { t: `Travou? Digite 'dica' para uma pista da próxima tarefa, ou 'dica <n>' para uma específica.`, tone: "dim" },
      { t: " ", tone: "dim" },
    ]);
    setDone({});
    setEvents([{ t: `link seguro estabelecido com ${L.alvo} [AUTO-SAVE ATIVO]`, tone: "ok" }]);
    setHud({ integ: integrity, globalClock, combo: 1, score: keep });
  }, []);

  const handleLogin = useCallback((nome: string) => {
    setOperatorName(nome);
    setPhase("lobby");
    try {
      localStorage.setItem(
        "initium.auth.user",
        JSON.stringify({ authenticated: true, operatorName: nome })
      );
      // Registrar jogador no laboratório
      const raw = localStorage.getItem("initium.lab.players");
      const players: any[] = raw ? JSON.parse(raw) : [];
      const existente = players.find((p: any) => p.nome === nome);
      const agora = Date.now();
      const atualizado = existente
        ? players.map((p: any) =>
            p.nome === nome
              ? { ...p, online: true, ultimaAtualizacao: agora }
              : p
          )
        : [
          ...players,
          {
            id: `player-${agora}-${Math.random().toString(36).slice(2, 8)}`,
            nome,
            score: 0,
            fase: 0,
            ultimaAtualizacao: agora,
            online: true,
            tasksConcluidas: 0,
            integridade: 100,
            tempoRestante: GLOBAL_TIME_BUDGET,
            penalidades: 0,
            registradoEm: agora,
          },
        ];
      localStorage.setItem("initium.lab.players", JSON.stringify(atualizado));
      new BroadcastChannel("initium.lab").postMessage({
        type: "PLAYERS_UPDATE",
        payload: atualizado,
      });
      realtime.current?.send({
        type: "PLAYER_UPSERT",
        payload: atualizado.find((player: any) => player.nome === nome),
      });
    } catch {}
  }, []);

  const handleLogout = useCallback(() => {
    const nomeOperador = operatorName;
    try {
      const raw = localStorage.getItem("initium.lab.players");
      const players: any[] = raw ? JSON.parse(raw) : [];
      const atualizado = players.map((player: any) =>
        player.nome === nomeOperador
          ? { ...player, online: false, ultimaAtualizacao: Date.now() }
          : player
      );
      localStorage.setItem("initium.lab.players", JSON.stringify(atualizado));
      const channel = new BroadcastChannel("initium.lab");
      channel.postMessage({ type: "PLAYERS_UPDATE", payload: atualizado });
      channel.close();
      realtime.current?.send({
        type: "PLAYER_UPSERT",
        payload: atualizado.find((player: any) => player.nome === nomeOperador),
      });
    } catch {}
    setOperatorName("");
    setPhase("login");
    try {
      localStorage.removeItem("initium.auth.user");
    } catch {}
  }, [operatorName]);

  const handleVoltarAdmin = useCallback(() => {
    window.location.assign("/");
  }, []);

  const handleAtualizarScoreJogador = useCallback((
    score: number,
    fase: number,
    stats: { tasksConcluidas?: number; integridade?: number; tempoRestante?: number; penalidades?: number } = {},
  ) => {
    if (!operatorName) return;
    try {
      const raw = localStorage.getItem("initium.lab.players");
      const players: any[] = raw ? JSON.parse(raw) : [];
      const agora = Date.now();
      const existente = players.find((player: any) => player.nome === operatorName);
      const jogadorAtualizado = {
        ...(existente ?? {}),
        id: `player-${agora}-${Math.random().toString(36).slice(2, 8)}`,
        nome: operatorName,
        score,
        fase,
        ultimaAtualizacao: agora,
        online: true,
        ...stats,
      };
      const atualizado = existente
        ? players.map((player: any) =>
            player.nome === operatorName
              ? { ...jogadorAtualizado, id: player.id }
              : player
          )
        : [...players, jogadorAtualizado];
      localStorage.setItem("initium.lab.players", JSON.stringify(atualizado));
      new BroadcastChannel("initium.lab").postMessage({
        type: "PLAYERS_UPDATE",
        payload: atualizado,
      });
      realtime.current?.send({
        type: "PLAYER_UPSERT",
        payload: atualizado.find((player: any) => player.nome === operatorName),
      });
    } catch {}
  }, [operatorName]);

  const ultimoScorePublicado = useRef<{ score: number; fase: number } | null>(null);
  useEffect(() => {
    if (phase !== "play" || !operatorName) return;
    const score = Math.round(g.current.score);
    const fase = li + 1;
    const anterior = ultimoScorePublicado.current;
    if (anterior?.score === score && anterior.fase === fase) return;
    ultimoScorePublicado.current = { score, fase };
    handleAtualizarScoreJogador(score, fase);
  }, [phase, operatorName, li, hud.score, handleAtualizarScoreJogador]);

  const handleStartLabDoLobby = useCallback((estado?: LabState) => {
    if (estado) setLabState(estado);
    if (estado?.status === "em_andamento" || labState.status === "em_andamento") {
      setPhase("play");
      setFocusHack((f) => f + 1);
    }
  }, [labState.status]);

  const startRun = useCallback(() => {
    if (labState.status !== "em_andamento") {
      setPhase("lobby");
      return;
    }
    setLi(0);
    g.current.score = 0;
    resetLevel(0, { score: 0, freshCampaign: true });
    saveGameProgress(0, 0, { clock: GLOBAL_TIME_BUDGET, integrity: 100 });
    setPwr((p) => p + 1);
    setPhase("briefing");
  }, [labState.status, resetLevel]);

  const resumeSave = useCallback((saved: SaveData) => {
    if (labState.status !== "em_andamento") {
      setPhase("lobby");
      return;
    }
    const targetIdx = Math.min(LEVELS.length - 1, Math.max(0, saved.currentLevelIndex));
    setLi(targetIdx);
    setUnlockedIndices(saved.unlockedLevelIndices || [0]);
    setCompletedIndices(saved.completedLevelIndices || []);
    resetLevel(targetIdx, {
      score: saved.score || 0,
      globalClock: saved.globalClockRemaining ?? GLOBAL_TIME_BUDGET,
      integrity: saved.integrityRemaining ?? 100,
    });
    setPwr((p) => p + 1);
    setPhase("briefing");
  }, [labState.status, resetLevel]);

  const selectLevelDirect = useCallback((targetIdx: number) => {
    setLi(targetIdx);
    resetLevel(targetIdx, { score: g.current.score });
    saveGameProgress(targetIdx, g.current.score);
    setPwr((p) => p + 1);
    setPhase("briefing");
  }, [resetLevel]);

  const manualSave = useCallback(() => {
    const updated = saveGameProgress(li, g.current.score, { clock: g.current.globalClock, integrity: g.current.integ });
    setUnlockedIndices(updated.unlockedLevelIndices);
    setCompletedIndices(updated.completedLevelIndices);
    setSaveNotice(true);
    setTimeout(() => setSaveNotice(false), 2400);
  }, [li]);

  /* ——— loop de simulação: dreno de integridade, relógio, cadeia ——— */
  useEffect(() => {
    // O contador só corre depois que o administrador liberou o laboratório.
    // Login, lobby, painel admin e menu não consomem a janela da operação.
    if (phase !== "briefing" && phase !== "play" && phase !== "pause") return;
    let raf = 0;
    let last = performance.now();
    let push = 0;
    let ev = 8;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = g.current;
      // Fase já perdida: nada mais a processar. (Na transição de vitória entre
      // fases `over` fica true por instantes, mas o relógio continua correndo.)
      if (s.over && s.integ <= 0) return;

      // ——— DRENO SINCRONIZADO AO CONTADOR ÚNICO DA OPERAÇÃO ———
      // Todos os clientes calculam o restante a partir do mesmo timestamp
      // emitido pelo administrador. O RAF local só atualiza a tela.
      const labElapsed = labState.startTime
        ? Math.max(0, (Date.now() - labState.startTime) / 1000)
        : 0;
      const syncedClock = labState.status === "em_andamento" && labState.startTime
        ? Math.max(0, labState.durationSeconds - labElapsed)
        : s.globalClock;
      s.globalClock = syncedClock;
      // A criticidade acompanha o mesmo relógio absoluto em todas as abas.
      // Penalidades operacionais continuam sendo descontadas além do tempo.
      const timeIntegrity = (100 * s.globalClock) / GLOBAL_TIME_BUDGET;
      s.integ = Math.max(0, timeIntegrity - s.integrityPenalty);

      if (now - s.lastTask > 15000) s.combo = Math.max(1, s.combo - dt * 0.15);

      if (!s.crit && s.integ < 25) {
        s.crit = true;
        setFlash("INTEGRIDADE CRÍTICA");
        setTimeout(() => setFlash(null), 900);
        say("⚠ integridade crítica — acelere a contenção", "err");
        setShake((k) => k + 1);
      }

      ev -= dt;
      if (ev <= 0) {
        ev = 9.0 - Math.min(4, li * 0.25) + Math.random() * 5;
        say(EVENTOS[(Math.random() * EVENTOS.length) | 0], Math.random() < 0.35 ? "warn" : "dim");
        if (Math.random() < 0.35) parts.current?.spike();
      }

      if (now - push > 90) {
        push = now;
        setHud({ integ: s.integ, globalClock: s.globalClock, combo: s.combo, score: Math.round(s.score) });
        setTaskElapsed(s.taskStartAt ? (now - s.taskStartAt) / 1000 : 0);
      }

      if (s.integ <= 0 && !s.failed) {
        s.failed = true;
        s.over = true;
        setFinalFaixa(lv.id);
        const tempoEsgotado = s.globalClock <= 0;
        const msg = tempoEsgotado
          ? "kernel: PANIC — contador de operação esgotado. Integridade zerada. campanha encerrada."
          : "kernel: PANIC — integridade esgotada por dano operacional antes do fim do contador.";
        setLines((p) => [
          ...p,
          { t: msg, tone: "err" },
          { t: `tempo global restante: ${formatClock(s.globalClock)} · integridade: 0%`, tone: "err" },
        ]);
        setShake((k) => k + 2);
        parts.current?.spike();
        say(tempoEsgotado ? "✖ tempo esgotado — integridade chegou a zero" : "✖ integridade esgotada antes do fim da janela", "err");
        setTimeout(() => setPhase("over"), 900);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, lv, li, labState.status, labState.startTime, labState.durationSeconds, say]);

  /* ——— execução de comando ——— */
  const run = useCallback(
    (raw: string) => {
      if (raw.startsWith("__COMPLETE__:")) {
        setLines((p) => [...p, { t: raw.slice(13), tone: "dim" }]);
        return;
      }
      const w = world.current;
      const before: Record<string, ObjectiveStatus> = {};
      lv.objetivos.forEach((o) => (before[o.id] = getObjectiveStatus(o, w)));

      const res = exec(raw, w, lv);
      if (res.lines.some((l) => l.t === "__CLEAR__")) setLines([]);
      else setLines((p) => [...p, { t: prompt + " " + raw, tone: "cmd" }, ...res.lines].slice(-300));

      const s = g.current;
      if (res.penalty) {
        // Penalidades NUNCA tocam no contador global: descontam a barra de
        // integridade e os pontos que a tarefa em andamento vai render.
        const pts = Math.round(res.penalty * 100);
        s.integrityPenalty += res.penalty;
        s.penaltyCount += 1;
        s.integ = Math.max(0, s.integ - res.penalty);
        s.taskPenalty += pts;
        if (res.hint) {
          say(`dica consultada (−${res.penalty} integridade · −${pts} pts na tarefa)`, "warn");
        } else {
          s.combo = 1;
          say(
            res.collat
              ? `COLATERAL — serviço legítimo derrubado (−${res.penalty} integridade · −${pts} pts na tarefa)`
              : `assinatura inválida (−${res.penalty} integridade · −${pts} pts na tarefa)`,
            "err"
          );
        }
      }
      if (res.shake) setShake((k) => k + 1);
      if (res.burst)
        parts.current?.burst(res.burst === "clean" ? "clean" : res.burst === "fire" ? "fire" : "kill");

      let cleared = 0;
      const after: Record<string, boolean> = {};
      const requirementAfter: RequirementProgress = {};
      lv.objetivos.forEach((o) => {
        const status = getObjectiveStatus(o, w);
        const was = before[o.id];
        after[o.id] = status.complete;
        requirementAfter[o.id] = {
          met: status.requirementsMet,
          total: status.requirementsTotal,
        };

        if (status.complete && !was.complete) {
          cleared++;
          s.combo = Math.min(3.5, s.combo + 0.4);
          s.lastTask = performance.now();

          // ——— PONTUAÇÃO POR TEMPO DE TAREFA ———
          // O cronômetro da tarefa começou no início da fase (ou na conclusão da
          // tarefa anterior). A nota depende de quanto tempo essa contenção levou.
          const taskSeconds = s.taskStartAt ? (performance.now() - s.taskStartAt) / 1000 : 0;
          const perf = evaluateTaskPerformance(taskSeconds);
          const penalty = s.taskPenalty;
          const gain = Math.max(0, Math.round(perf.score * s.combo) - penalty);
          s.taskPenalty = 0;
          s.taskScore += gain;
          s.score += gain;
          s.taskStartAt = performance.now();
          setTaskTimes((prev) => ({ ...prev, [o.id]: Math.round(taskSeconds) }));
          setTaskElapsed(0);

          say(`✔ ${o.titulo} — ${Math.round(taskSeconds)}s · nota ${perf.grade} · +${gain} pts [CONCLUÍDO]`, "ok");
          const pk = performance.now();
          setPop({ t: `+${gain}  ×${s.combo.toFixed(2)}`, k: pk });
          setTimeout(() => setPop((p) => (p && p.k === pk ? null : p)), 750);
          setLines((p) => [
            ...p,
            {
              t: `>>> TAREFA CONCLUÍDA — ${o.titulo}  (+${gain} pts · ${Math.round(taskSeconds)}s · nota ${perf.grade} ${perf.multiplier.toFixed(2)}×${penalty ? ` · −${penalty} penalidades` : ""})`,
              tone: "ok",
            },
          ]);
          parts.current?.burst("kill");
          setShake((k) => k + 1);

          // Salvar progresso automaticamente no checkpoint
          saveGameProgress(li, s.score, { clock: s.globalClock, integrity: s.integ });
        } else if (
          !status.complete &&
          status.requirementsMet > was.requirementsMet
        ) {
          // Partial progress is visible, but a task and its reward remain locked
          // until every requirement passes.
          const remaining = status.requirementsTotal - status.requirementsMet;
          const progressLine = `>>> REQUISITO ATENDIDO — ${o.titulo} (${status.requirementsMet}/${status.requirementsTotal}); faltam ${remaining}. Sem pontos até concluir a tarefa.`;
          say(`${o.titulo}: requisito ${status.requirementsMet}/${status.requirementsTotal} atendido; tarefa ainda pendente`, "dim");
          setLines((p) => [...p, { t: progressLine, tone: "dim" }]);
        }
      });
      setDone(after);
      setRequirementProgress(requirementAfter);
      if (cleared) {
        s.tasksCompleted += cleared;
        handleAtualizarScoreJogador(s.score, li + 1, {
          tasksConcluidas: s.tasksCompleted,
          integridade: s.integ,
          tempoRestante: s.globalClock,
          penalidades: s.penaltyCount,
        });
      }
      setHud({ integ: s.integ, globalClock: s.globalClock, combo: s.combo, score: Math.round(s.score) });

      if (cleared && Object.values(after).every(Boolean)) {
        // ——— RELATÓRIO FINAL: pontuação construída tarefa por tarefa ———
        const elapsedSeconds = s.levelStartTime ? (performance.now() - s.levelStartTime) / 1000 : 0;
        const times = lv.objetivos.map((o) => taskTimesRef.current[o.id] ?? 0);
        const breakdown = evaluateLevelPerformance({
          timeSpentSeconds: elapsedSeconds,
          remainingIntegrityPct: s.integ,
          objectivesCompletedCount: lv.objetivos.length,
          objectivesTotalCount: lv.objetivos.length,
          taskScore: s.taskScore,
          taskTimes: times,
        });
        s.score = s.score + breakdown.totalScore;
        setLastGrade(breakdown);
        setFlash(`[${breakdown.grade}] FASE ${lv.codinome} SELADA`);
        say(`AVALIAÇÃO ${breakdown.grade} · ${breakdown.totalScore.toLocaleString("pt-BR")} pts · ${breakdown.message}`, "ok");
        setLines((p) => [
          ...p,
          { t: "", tone: "dim" },
          { t: `=== RELATÓRIO DE DESEMPENHO — ${lv.codinome} ===`, tone: "ok" },
          { t: `Nota da fase: ${breakdown.grade} · ${breakdown.gradeLabel}`, tone: "warn" },
          { t: `Orçamento por tarefa: ${breakdown.taskBudgetSeconds}s · média obtida: ${breakdown.averageTaskSeconds}s`, tone: "dim" },
          ...lv.objetivos.map((o, i) => {
            const t = times[i] ?? 0;
            const perf = evaluateTaskPerformance(t);
            return {
              t: `  ${String(i + 1).padStart(2, "0")}. ${o.titulo} — ${t}s · nota ${perf.grade} (${perf.multiplier.toFixed(2)}×) · ${(perf.score).toLocaleString("pt-BR")} pts base`,
              tone: perf.grade === "S" || perf.grade === "A" ? "ok" : perf.grade === "B" ? "warn" : "dim",
            };
          }),
          { t: `Pontuação das tarefas: ${breakdown.taskScore.toLocaleString("pt-BR")} pts`, tone: "dim" },
          { t: `Multiplicador da fase: ×${breakdown.levelMultiplier.toFixed(2)}`, tone: "warn" },
          { t: `Bônus por tempo restante: +${breakdown.timeBonus.toLocaleString("pt-BR")} pts`, tone: "dim" },
          { t: `Bônus por integridade: +${breakdown.integrityBonus.toLocaleString("pt-BR")} pts`, tone: "dim" },
          { t: `Integridade remanescente: ${breakdown.integrityLeft}%`, tone: "dim" },
          { t: `PONTUAÇÃO FINAL DA FASE: ${breakdown.totalScore.toLocaleString("pt-BR")} pts`, tone: "ok" },
          { t: `Máximo possível: ${breakdown.maxPossibleForLevel.toLocaleString("pt-BR")} pts`, tone: "dim" },
          { t: "", tone: "dim" },
        ]);
        parts.current?.burst("clean");
        setShake((k) => k + 2);
        setHud({ integ: s.integ, globalClock: s.globalClock, combo: s.combo, score: Math.round(s.score) });
        g.current.over = true;

        // Salvar conclusão da fase, desbloqueio e nota de performance
        const saved = saveGameProgress(li, s.score, { markCompleted: true, grade: breakdown.grade, clock: s.globalClock, integrity: s.integ });
        setUnlockedIndices(saved.unlockedLevelIndices);
        setCompletedIndices(saved.completedLevelIndices);

        setTimeout(() => setFlash(null), 1200);
        setTimeout(() => {
          if (li >= LEVELS.length - 1) {
            setFinalFaixa(lv.id);
            setPhase("victory");
          } else {
            const nextIdx = li + 1;
            setLi(nextIdx);
            resetLevel(nextIdx);
            g.current.score = s.score;
            setHud((h) => ({ ...h, score: Math.round(s.score) }));
            setPwr((p) => p + 1);
            setPhase("briefing");
          }
        }, 1600);
      }
    },
    [lv, li, prompt, resetLevel, say]
  );

  /* ——— teclas globais ——— */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inInput = e.target instanceof HTMLInputElement;
      if (e.key === "Escape") {
        e.preventDefault();
        if (selectorOpen) {
          setSelectorOpen(false);
          return;
        }
        setPhase((p) => (p === "play" ? "pause" : p === "pause" ? "play" : p));
        return;
      }
      if (inInput) return;
      if (e.key === "Enter") {
        if (phase === "title") startRun();
        else if (phase === "briefing") {
          setPhase("play");
          setFocusHack((f) => f + 1);
        } else if (phase === "over" || phase === "victory") startRun();
        else if (phase === "pause") setPhase("play");
      }
      if ((e.key === "r" || e.key === "R") && (phase === "pause" || phase === "over")) {
        // Reiniciar durante a pausa NÃO devolve tempo; após falha, nova janela.
        resetLevel(li, phase === "over" ? { freshCampaign: true } : {});
        setPwr((p) => p + 1);
        setPhase("play");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, li, resetLevel, startRun, selectorOpen]);

  useEffect(() => {
    if (phase === "play") setFocusHack((f) => f + 1);
  }, [phase]);

  const shakeCls = shake ? "shake" : "";
  useEffect(() => {
    if (!shake) return;
    const t = setTimeout(() => setShake(0), 280);
    return () => clearTimeout(t);
  }, [shake]);

  const playing = phase === "play" || phase === "pause";

  if (adminRoute) {
    return (
      <div className="chassis relative min-h-[100dvh] w-full overflow-hidden text-slate">
        <AdminPanel key="admin-route" onVoltar={handleVoltarAdmin} />
      </div>
    );
  }

  return (
    <div className="chassis relative h-[100dvh] w-full min-w-0 max-w-full overflow-hidden text-slate">
      <div className={`flex h-full min-w-0 max-w-full flex-col overflow-hidden p-2 sm:p-3 ${shakeCls}`}>
        {/* ——— faixa de topo do rack ——— */}
        <header className="module relative mb-2 flex w-full min-w-0 shrink-0 items-center gap-2 overflow-hidden px-3 py-2 sm:gap-3 sm:px-4">
          <span className="screw left-1.5 top-1.5" />
          <span className="screw right-1.5 bottom-1.5" />
          <Mark className="h-7 w-7 shrink-0 sm:h-8 sm:w-8" />
          <div className="min-w-0 flex-1 leading-none">
            <div className="disp truncate text-[17px] text-phos glow sm:text-[19px]">INITIUM</div>
            <div className="truncate">
              <Silk>
                <span className="sm:hidden">csirt nacional</span>
                <span className="hidden sm:inline">csirt nacional · defesa cibernética militar</span>
              </Silk>
            </div>
          </div>
          <div className="ml-auto flex min-w-0 max-w-[58%] shrink overflow-x-auto no-scrollbar items-center justify-end gap-1">
            <button
              onClick={() => setSelectorOpen(true)}
              className="chip border border-hair bg-panel2 px-2 py-2 text-[9px] tracking-[0.16em] whitespace-nowrap text-slate hover:border-phos hover:text-phos-lt sm:px-3 sm:text-[10px] sm:tracking-[0.22em]"
            >
              FASES
            </button>
            {(["console", "quadro"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setChan(c)}
                className={`chip border px-2 py-2 text-[9px] tracking-[0.16em] whitespace-nowrap uppercase sm:px-3 sm:text-[10px] sm:tracking-[0.22em] ${
                  chan === c ? "border-phos bg-phos/15 text-phos" : "border-hair bg-panel2 text-slate2"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </header>

        {/* ——— HUD compacto do jogador ——— */}
        <div className="module mb-2 flex w-full min-w-0 shrink-0 items-center gap-2 overflow-hidden px-2.5 py-2 sm:gap-4 sm:px-4">
          <div className="min-w-0 leading-none">
            <Silk>pontos</Silk>
            <div className="tabnum mt-1 max-w-[18vw] truncate text-[14px] font-bold text-phos glow sm:text-[16px]">
              {hud.score.toLocaleString("pt-BR")}
            </div>
          </div>
          <div className="shrink-0 leading-none">
            <Silk>cadeia</Silk>
            <div className={`tabnum mt-1 text-[13px] font-bold whitespace-nowrap ${hud.combo > 1 ? "text-amber" : "text-slate"}`}>
              ×{hud.combo.toFixed(2)}
            </div>
          </div>
          <div className="min-w-0 flex-1 px-1 sm:px-2">
            <div className="mb-1 flex items-baseline justify-between gap-1">
              <Silk>integridade</Silk>
              <span className="tabnum shrink-0 text-[10px] whitespace-nowrap text-phos-lt">
                {Math.max(0, hud.integ).toFixed(1)}%
              </span>
            </div>
            <Bargraph value={hud.integ} segs={24} danger={hud.integ < 25} />
          </div>
          <div className="shrink-0 leading-none">
            <Silk>operação</Silk>
            <div className="tabnum mt-1 text-[13px] whitespace-nowrap text-phos-lt">
              {Math.floor(hud.globalClock / 3600)}:
              {String(Math.floor((hud.globalClock % 3600) / 60)).padStart(2, "0")}:
              {String(Math.floor(hud.globalClock % 60)).padStart(2, "0")}
            </div>
          </div>
          <button
            onClick={() => setPhase((p) => (p === "play" ? "pause" : p === "pause" ? "play" : p))}
            aria-label={phase === "pause" ? "retomar operação" : "pausar operação"}
            title={phase === "pause" ? "Retomar (ESC)" : "Pausar (ESC)"}
            className="chip flex h-9 w-9 shrink-0 items-center justify-center border border-hair bg-panel2 text-[12px] text-slate hover:border-phos hover:text-phos"
          >
            {phase === "pause" ? "▶" : "❚❚"}
          </button>
        </div>

        {/* ——— UMA VISTA POR VEZ: CONSOLE OU QUADRO ——— */}
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-2 overflow-hidden">
          <div className={`${chan === "console" ? "flex" : "hidden"} module min-h-0 min-w-0 flex-1 overflow-hidden p-1.5`}>
            <MTerminal
              lines={lines}
              prompt={prompt}
              chips={chips}
              busy={phase !== "play"}
              objetivos={lv.objetivos}
              done={done}
              requirementProgress={requirementProgress}
              taskTimes={taskTimes}
              taskElapsed={taskElapsed}
              onSubmit={run}
              complete={doComplete}
              onFocusHack={focusHack}
            />
          </div>

          <div className={`${chan === "quadro" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 overflow-hidden`}>
            <MSystemLog lv={lv} events={events} />
          </div>
        </div>

        <footer className="mt-2 hidden w-full min-w-0 shrink-0 items-center gap-3 lg:flex">
          <div className="min-w-0 flex-1 truncate">
            <Silk>tab completa · ↑↓ histórico · esc pausa · auto-save ativo a cada tarefa</Silk>
          </div>
          <div className="hairline min-w-[24px] flex-1" />
          <div className="shrink-0 whitespace-nowrap">
            <Silk>campanha completa: {LEVELS.length} fases · 1h30 · build 6.0.0</Silk>
          </div>
        </footer>
      </div>

      <ParticleField ref={parts} className="pointer-events-none absolute inset-0 z-[5] h-full w-full opacity-70" />
      <div
        key={pwr}
        className={`pointer-events-none absolute inset-0 z-[6] bg-[#8cffc0] mix-blend-screen ${
          pwr ? "powercut opacity-[0.07]" : "opacity-0"
        }`}
      />
      <Flash text={flash} />

      <AnimatePresence>
        {pop && (
          <motion.div
            key={pop.k}
            initial={{ opacity: 0, y: 16, scale: 0.86 }}
            animate={{ opacity: 1, y: -14, scale: 1 }}
            exit={{ opacity: 0, y: -34, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 20 }}
            className="pointer-events-none absolute top-[24%] left-1/2 z-20 w-full max-w-full -translate-x-1/2 px-4 text-center"
          >
            <span className="disp inline-block max-w-full text-[clamp(20px,5vw,46px)] whitespace-nowrap text-phos glow">{pop.t}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === "play" && hud.integ < 25 && (
        <div className="pointer-events-none absolute inset-0 z-[7] animate-pulse bg-alarm/10 mix-blend-screen" />
      )}

      {/* ——— MODAIS E TELAS SOBREPOSTAS ——— */}
      <AnimatePresence>
        {phase === "login" && (
          <LoginScreen key="l" onLogin={handleLogin} />
        )}
        {phase === "lobby" && (
          <LobbyScreen
            key="lb"
            operatorName={operatorName}
            onStartLab={handleStartLabDoLobby}
            onVoltar={() => setPhase("title")}
          />
        )}
        {phase === "admin" && (
          <AdminPanel key="ad" onVoltar={handleVoltarAdmin} />
        )}
        {phase === "title" && (
          <TitleScreen
            key="t"
            onStart={startRun}
            onResume={resumeSave}
            onLogout={handleLogout}
          />
        )}
        {phase === "briefing" && (
          <Briefing
            key="b"
            lv={lv}
            totalLevels={LEVELS.length}
            globalClock={hud.globalClock}
            onGo={() => {
              setPhase("play");
              setFocusHack((f) => f + 1);
            }}
          />
        )}
        {phase === "pause" && (
          <PausePlate
            key="p"
            onResume={() => setPhase("play")}
            onSaveProgress={manualSave}
            onOpenSelector={() => {
              setSelectorOpen(true);
            }}
            onRestart={() => {
              resetLevel(li);
              setPwr((p) => p + 1);
              setPhase("play");
            }}
            onQuit={() => setPhase("title")}
            saveNotice={saveNotice}
          />
        )}
        {(phase === "over" || phase === "victory") && (
          <motion.div key="e" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <EndPlate
              win={phase === "victory"}
              score={Math.round(g.current.score)}
              faixa={finalFaixa}
              totalLevels={LEVELS.length}
              lastGrade={lastGrade}
              onRestart={() => {
                if (phase === "victory") startRun();
                else {
                  resetLevel(li, { freshCampaign: true });
                  setPwr((p) => p + 1);
                  setPhase("play");
                }
              }}
              onNext={() => {
                if (li < LEVELS.length - 1) {
                  const n = li + 1;
                  setLi(n);
                  resetLevel(n, { freshCampaign: true });
                  setPwr((p) => p + 1);
                  setPhase("briefing");
                }
              }}
              onOpenSelector={() => setSelectorOpen(true)}
              onQuit={() => setPhase("title")}
            />
          </motion.div>
        )}

        {selectorOpen && (
          <MissionSelectorModal
            key="selector"
            unlocked={unlockedIndices}
            completed={completedIndices}
            currentLevel={li}
            onSelectLevel={selectLevelDirect}
            onClose={() => setSelectorOpen(false)}
          />
        )}
      </AnimatePresence>

      {playing && (
        <div className="sr-only" aria-live="polite">
          {lv.codinome} — integridade {Math.round(hud.integ)}% — contador global {formatClock(hud.globalClock)}
        </div>
      )}
    </div>
  );
}
