import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LEVELS, type Level } from "../game/model";
import { Mark, Silk } from "./Rack";
import type { LevelScoreBreakdown } from "../game/scoring";
import { loadGameSave, type SaveData } from "../game/save";
import { connectRealtime } from "../realtime";

export type Score = { nome: string; pts: number; faixa: number; data: string };

const KEY = "initium.hiscores.v1";

export function loadScores(): Score[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    return (JSON.parse(raw) as Score[]).sort((a, b) => b.pts - a.pts).slice(0, 8);
  } catch {
    return [];
  }
}
export function saveScore(s: Score): Score[] {
  const all = [...loadScores(), s].sort((a, b) => b.pts - a.pts).slice(0, 8);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    const channel = new BroadcastChannel("initium.lab");
    channel.postMessage({ type: "SCORES_UPDATE", payload: all });
    channel.close();
    const realtime = connectRealtime(() => {});
    realtime.send({ type: "SCORE_UPSERT", payload: s });
    setTimeout(() => realtime.close(), 250);
  } catch {
    /* ignore */
  }
  return all;
}
export function qualifies(pts: number) {
  const l = loadScores();
  return pts > 0 && (l.length < 8 || pts > l[l.length - 1].pts);
}

const plate = "absolute inset-0 z-30 flex flex-col overflow-y-auto overscroll-contain no-scrollbar";
// m-auto em vez de flex-1 + justify-center: centraliza quando curto e NUNCA corta o topo ao rolar
const wrap = "m-auto flex w-full max-w-[1240px] min-w-0 flex-col px-4 py-6 sm:px-8";

export function ScoreTable({ scores, highlight }: { scores: Score[]; highlight?: number }) {
  return (
    <div className="module relative min-w-0 overflow-hidden px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <Silk lit>registro de operadores · top 08</Silk>
        <Silk>local</Silk>
      </div>
      <div className="mt-3 min-w-0">
        <div className="silk grid grid-cols-[24px_minmax(0,1fr)_72px_44px] gap-2 pb-1.5 sm:grid-cols-[28px_minmax(0,1fr)_88px_52px]">
          <span>#</span>
          <span className="min-w-0 truncate">codinome</span>
          <span className="text-right whitespace-nowrap">pontos</span>
          <span className="text-right whitespace-nowrap">faixa</span>
        </div>
        {scores.length === 0 && (
          <div className="border-t border-hair py-4 text-center text-[11px] break-words text-slate2">
            nenhum registro — o quadro está vazio
          </div>
        )}
        {scores.map((s, i) => (
          <div
            key={i}
            className={`tabnum grid grid-cols-[24px_minmax(0,1fr)_72px_44px] gap-2 border-t border-hair py-1.5 text-[12px] sm:grid-cols-[28px_minmax(0,1fr)_88px_52px] ${
              highlight === i ? "bg-phos/10 text-phos glow" : i < 3 ? "text-phos-lt" : "text-slate"
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
  );
}

export function MissionSelectorModal({
  unlocked,
  completed,
  currentLevel,
  onSelectLevel,
  onClose,
}: {
  unlocked: number[];
  completed: number[];
  currentLevel: number;
  onSelectLevel: (levelIndex: number) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 flex overflow-y-auto overscroll-contain bg-chassis/95 p-3 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="module m-auto flex max-h-[92vh] w-full max-w-[1100px] flex-col overflow-hidden p-4 sm:p-6"
      >
        <div className="flex shrink-0 flex-col gap-3 border-b border-hair pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Silk lit>central de operações estratégicas</Silk>
            <h3 className="disp mt-1 text-[20px] leading-tight break-words text-phos glow sm:text-[28px] lg:text-[32px]">
              SELETOR DE MISSÕES · {LEVELS.length} SETORES CRÍTICOS
            </h3>
          </div>
          <button
            onClick={onClose}
            className="chip shrink-0 self-start border border-hair px-3 py-1.5 text-[11px] tracking-widest whitespace-nowrap text-slate hover:border-phos hover:text-phos sm:self-auto"
          >
            FECHAR [ESC]
          </button>
        </div>

        <div
          tabIndex={0}
          aria-label="lista de missões — role para ver todas"
          className="mission-scroll my-4 grid min-h-0 flex-1 touch-pan-y gap-2.5 overflow-y-auto overscroll-contain pr-2 sm:grid-cols-2 md:grid-cols-4"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {LEVELS.map((level, idx) => {
            const isUnlocked = unlocked.includes(idx);
            const isCompleted = completed.includes(idx);
            const isCurrent = currentLevel === idx;

            return (
              <button
                key={level.id}
                disabled={!isUnlocked}
                onClick={() => {
                  onSelectLevel(idx);
                  onClose();
                }}
                className={`flex min-w-0 flex-col border p-3 text-left transition-all ${
                  isCurrent
                    ? "border-phos bg-phos/15 shadow-[0_0_15px_rgba(57,255,136,0.25)]"
                    : isCompleted
                      ? "border-phos/50 bg-[#0e1614] hover:border-phos"
                      : isUnlocked
                        ? "border-hair bg-[#11171a] hover:border-phos/70"
                        : "border-hair/30 bg-[#0a0d0e]/60 opacity-40 cursor-not-allowed"
                }`}
              >
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="tabnum shrink-0 font-mono whitespace-nowrap text-slate2">
                    FASE {String(level.id).padStart(2, "0")}
                  </span>
                  <span
                    className={`shrink-0 font-mono px-1.5 py-0.5 text-[9px] uppercase tracking-wider whitespace-nowrap ${
                      isCurrent
                        ? "bg-phos text-chassis font-bold"
                        : isCompleted
                          ? "bg-phos/20 text-phos"
                          : isUnlocked
                            ? "bg-amber/20 text-amber"
                            : "bg-hair text-slate2"
                    }`}
                  >
                    {isCurrent ? "EM CURSO" : isCompleted ? "CONCLUÍDA" : isUnlocked ? "LIBERADA" : "BLOQUEADA"}
                  </span>
                </div>

                <div className="disp mt-2 text-[18px] leading-tight break-words text-phos-lt group-hover:text-phos">
                  {level.codinome}
                </div>
                <div className="line-clamp-2 mt-1 text-[10.5px] leading-tight break-words text-slate2">
                  {level.setor}
                </div>
                <div className="mt-auto flex items-center justify-between gap-2 pt-2 text-[10px] text-slate2">
                  <span className="shrink-0 whitespace-nowrap">{level.objetivos.length} tarefas</span>
                  <span className="min-w-0 truncate font-mono text-phos-lt">{level.ip}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 flex-col gap-1 border-t border-hair pt-3 text-[11px] break-words text-slate sm:flex-row sm:items-center sm:justify-between">
          <span>
            {completed.length} de {LEVELS.length} setores liberados e defendidos com sucesso
          </span>
          <span className="silk shrink-0">campanha total: 1h30 de conteúdo tático</span>
        </div>
      </motion.div>
    </div>
  );
}

export function TitleScreen({
  onStart,
  onResume,
  onLogout,
}: {
  onStart: () => void;
  onResume?: (savedData: SaveData) => void;
  onLogout?: () => void;
}) {
  const scores = loadScores();
  const savedData = loadGameSave();
  const hasSave = savedData && (savedData.currentLevelIndex > 0 || savedData.completedLevelIndices.length > 0 || savedData.score > 0);
  const currentSavedLevel = savedData ? LEVELS[savedData.currentLevelIndex] ?? LEVELS[0] : null;

  return (
    <div className={`${plate} bg-chassis/97 backdrop-blur-[2px]`}>
      <div className={wrap}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Mark className="h-9 w-9 shrink-0" />
          <div className="min-w-0">
            <Silk>núcleo de defesa cibernética nacional</Silk>
          </div>
          <div className="hairline hidden min-w-[32px] flex-1 sm:block" />
          <div className="hidden shrink-0 sm:block">
            <Silk>versão 6.0 · campanha {LEVELS.length} setores</Silk>
          </div>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 14, scaleY: 0.86 }}
          animate={{ opacity: 1, y: 0, scaleY: 1 }}
          transition={{ duration: 0.5, ease: [0.2, 0.9, 0.2, 1] }}
          className="disp mt-5 w-full text-[clamp(44px,15vw,175px)] break-words text-phos glow"
        >
          INITIUM
        </motion.h1>

        <div className="mt-3 grid min-w-0 gap-5 border-t border-hair pt-5 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <p className="max-w-[58ch] text-[13px] leading-relaxed text-slate">
              Você é o operador sênior de prontidão do <span className="text-phos-lt">CSIRT Nacional</span>.
              Seis infraestruturas críticas brasileiras estão sob ataque coordenado simultâneo —
              sistema financeiro (PIX/BACEN), urnas eleitorais, malha de 500 kV, telemetria satelital,
              cabos submarinos, usinas nucleares de Angra, o Comando de Defesa Cibernética e o gateway central BGP.
              Toda a campanha corre contra um <span className="text-amber font-semibold">contador único de 1h30</span> —
              ele não reinicia entre fases. Um console Linux autêntico, com persistência automática de progresso.
            </p>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
              {[
                ["01", "CONTADOR ÚNICO", "1h30 para a campanha inteira, sem reset entre fases"],
                ["02", `${LEVELS.length} MISSÕES`, "Campanha concentrada de 1h30 de gameplay"],
                ["03", "AUTO-SAVE", "Progresso gravado a cada objetivo e fase"],
              ].map(([n, t, d]) => (
                <div key={n} className="border-l-2 border-phos/40 pl-3">
                  <span className="tabnum text-[10px] text-amber">{n}</span>
                  <div className="mt-0.5 text-[11px] font-bold tracking-[0.12em] text-phos-lt">
                    {t}
                  </div>
                  <div className="mt-1 text-[10px] leading-snug text-slate2">{d}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              {hasSave && currentSavedLevel && onResume && (
                <button
                  onClick={() => onResume(savedData)}
                  className="btn-slab w-full min-w-0 overflow-hidden border-2 border-phos bg-phos/20 px-4 py-4 text-left text-phos hover:bg-phos/30 shadow-[0_0_20px_rgba(57,255,136,0.2)] sm:px-6"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <span className="disp min-w-0 text-[clamp(17px,4.5vw,28px)] leading-tight break-words">
                      CONTINUAR OPERAÇÃO ?
                    </span>
                    <span className="silk tabnum shrink-0 whitespace-nowrap text-phos-lt">
                      FASE {String(currentSavedLevel.id).padStart(2, "0")}/{String(LEVELS.length).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="silk mt-1 text-[10.5px] leading-snug break-words text-phos-lt normal-case tracking-normal">
                    {currentSavedLevel.codinome} · {currentSavedLevel.setor} · Pontos: {savedData.score.toLocaleString("pt-BR")}
                  </div>
                </button>
              )}

              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                <button
                  onClick={onStart}
                  className="btn-slab min-w-0 overflow-hidden border border-phos/60 bg-phos/10 px-4 py-3.5 text-left text-phos hover:bg-phos/20 sm:px-6"
                >
                  <span className="disp block text-[16px] leading-tight break-words sm:text-[18px]">
                    {hasSave ? "RECOMEÇAR CAMPANHA (FASE 01) ?" : "INICIAR OPERAÇÃO COMPLETA ?"}
                  </span>
                  <span className="silk mt-0.5 block">enter · teclado ou toque</span>
                </button>

                {onLogout && (
                  <button
                    onClick={onLogout}
                    className="btn-slab min-w-0 overflow-hidden border border-alarm/60 bg-alarm/10 px-4 py-3.5 text-left text-alarm hover:bg-alarm/20 sm:px-5"
                  >
                    <span className="disp block text-[15px] leading-tight break-words sm:text-[16px]">SAIR (LOGOUT)</span>
                    <span className="silk mt-0.5 block">encerrar sessão do operador</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <ScoreTable scores={scores} />
        </div>
      </div>
    </div>
  );
}

export function Briefing({
  lv,
  totalLevels,
  globalClock,
  onGo,
}: {
  lv: Level;
  totalLevels: number;
  globalClock: number;
  onGo: () => void;
}) {
  const h = Math.floor(globalClock / 3600);
  const m = Math.floor((globalClock % 3600) / 60);
  const s = Math.floor(globalClock % 60);
  const contador = `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`${plate} bg-chassis/97`}
    >
      <div className={wrap}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0">
            <Silk lit>ordem de operação</Silk>
          </div>
          <div className="hairline min-w-[32px] flex-1" />
          <div className="shrink-0 whitespace-nowrap">
            <Silk>
              faixa {String(lv.id).padStart(2, "0")} de {String(totalLevels).padStart(2, "0")}
            </Silk>
          </div>
        </div>
        <motion.div
          initial={{ x: -30, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4 }}
          className="min-w-0"
        >
          <div className="mt-3 text-[10px] leading-relaxed tracking-[0.28em] break-words text-amber uppercase sm:text-[11px] sm:tracking-[0.34em]">
            {lv.setor}
          </div>
          <h2 className="disp mt-2 w-full text-[clamp(34px,11vw,140px)] leading-[0.95] break-words text-phos glow">
            {lv.codinome}
          </h2>
        </motion.div>
        <div className="mt-4 grid min-w-0 gap-6 border-t border-hair pt-5 md:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
          <div className="min-w-0">
            <p className="max-w-[58ch] text-[13px] leading-relaxed break-words text-slate">{lv.resumo}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["alvo", lv.alvo],
                ["nó", lv.ip],
                ["vetor", lv.attackerIp],
                ["contador global", contador],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <Silk>{k}</Silk>
                  <div className="tabnum mt-1 truncate text-[11px] text-phos-lt" title={v}>{v}</div>
                </div>
              ))}
            </div>
            <button
              onClick={onGo}
              className="btn-slab mt-7 w-full min-w-0 overflow-hidden border border-phos bg-phos/12 px-4 py-5 text-left text-phos hover:bg-phos/20 sm:px-8"
            >
              <span className="disp block text-[clamp(17px,4.5vw,30px)] leading-tight break-words">ABRIR CONSOLE TÁTICO ▸</span>
              <span className="silk mt-1 block">enter</span>
            </button>
          </div>
          <div className="module min-w-0 px-4 py-4">
            <Silk lit>lista de contenção obrigatória</Silk>
            <div className="mt-3 space-y-2">
              {lv.objetivos.map((o, i) => (
                <div key={o.id} className="flex gap-2 text-[11px] leading-snug">
                  <span className="tabnum shrink-0 text-slate2">{String(i + 1).padStart(2, "0")}</span>
                  <span className="min-w-0 break-words text-phos-lt">{o.titulo}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function PausePlate({
  onResume,
  onRestart,
  onSaveProgress,
  onOpenSelector,
  onQuit,
  saveNotice,
}: {
  onResume: () => void;
  onRestart: () => void;
  onSaveProgress: () => void;
  onOpenSelector?: () => void;
  onQuit: () => void;
  saveNotice?: boolean;
}) {
  return (
    <div className="absolute inset-0 z-30 flex overflow-y-auto overscroll-contain bg-chassis/92 p-3 backdrop-blur-[3px]">
      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="module m-auto w-[min(480px,100%)] min-w-0 px-5 py-6 sm:px-7 sm:py-7"
      >
        <Silk lit>suspensão de operação</Silk>
        <h2 className="disp mt-2 text-[clamp(30px,8vw,56px)] break-words text-amber">PAUSADO</h2>
        <p className="mt-2 text-[11.5px] leading-relaxed break-words text-slate">
          Atenção: o contador global da operação CONTINUA correndo durante a pausa. Salve um checkpoint e volte ao console o quanto antes.
        </p>

        {saveNotice && (
          <div className="mt-3 border border-phos/60 bg-phos/15 px-3 py-2 text-center text-[11px] font-bold break-words text-phos">
            CHECKPOINT SALVO COM SUCESSO NO ARMAZENAMENTO LOCAL
          </div>
        )}

        <div className="mt-6 grid gap-2">
          <Btn onClick={onResume} tone="phos">
            RETOMAR OPERAÇÃO ▸ <em className="silk not-italic">esc</em>
          </Btn>
          <Btn onClick={onSaveProgress} tone="slate">
            SALVAR CHECKPOINT <em className="silk not-italic">salvo</em>
          </Btn>
          {onOpenSelector && (
            <Btn onClick={onOpenSelector} tone="slate">
              SELETOR DE MISSÕES ({LEVELS.length} FASES)
            </Btn>
          )}
          <Btn onClick={onRestart} tone="slate">
            REINICIAR FASE ATUAL <em className="silk not-italic">r</em>
          </Btn>
          <Btn onClick={onQuit} tone="alarm">
            SAIR PARA O MENU PRINCIPAL
          </Btn>
        </div>
      </motion.div>
    </div>
  );
}

export function EndPlate({
  win,
  score,
  faixa,
  totalLevels,
  lastGrade,
  onNext,
  onRestart,
  onOpenSelector,
  onQuit,
}: {
  win: boolean;
  score: number;
  faixa: number;
  totalLevels: number;
  lastGrade?: LevelScoreBreakdown | null;
  onNext?: () => void;
  onRestart: () => void;
  onOpenSelector?: () => void;
  onQuit: () => void;
}) {
  const [nome, setNome] = useState("");
  const [saved, setSaved] = useState<Score[] | null>(null);
  const canSave = qualifies(score) && !saved;

  const commit = () => {
    const s: Score[] = saveScore({
      nome: (nome.trim() || "OPS").toUpperCase().slice(0, 3),
      pts: score,
      faixa,
      data: new Date().toLocaleDateString("pt-BR"),
    });
    setSaved(s);
  };

  return (
    <div className={`${plate} bg-chassis/96 backdrop-blur-[2px]`}>
      <div className={wrap}>
        <div className="min-w-0">
          <Silk lit>{win ? "relatório final de soberania" : "falha temporária de contenção"}</Silk>
        </div>
        <h2
          className={`disp mt-2 w-full text-[clamp(26px,7.5vw,96px)] leading-[0.95] break-words ${
            win ? "text-phos glow" : "text-alarm glow-err"
          }`}
        >
          {win ? "SOBERANIA NACIONAL RESTABELECIDA" : "SERVIDOR COMPROMETIDO"}
        </h2>
        <p className="mt-3 max-w-[64ch] text-[13px] leading-relaxed break-words text-slate">
          {win
            ? `Todos os ${totalLevels} setores estratégicos da infraestrutura nacional foram defendidos e neutralizados. Os ataques de estados-nação, ransomware, rootkits e o sequestro de rotas BGP foram frustrados. O Brasil mantém soberania total sobre sua rede.`
            : "A integridade nacional chegou a zero sob a carga do vetor hostil. O progresso foi mantido: reinicie a fase para abrir uma nova janela de operação ou escolha outro setor no seletor."}
        </p>

        <div className="mt-6 grid min-w-0 gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)]">
          <div className="min-w-0">
            <div className="grid grid-cols-3 gap-2 border-y border-hair py-5 sm:gap-4">
              <div className="min-w-0">
                <Silk>pontuação final</Silk>
                <div className="disp tabnum mt-1 text-[clamp(20px,6vw,42px)] leading-tight break-words text-phos">
                  {score.toLocaleString("pt-BR")}
                </div>
              </div>
              <div className="min-w-0">
                <Silk>fase alcançada</Silk>
                <div className="disp tabnum mt-1 text-[clamp(20px,6vw,42px)] leading-tight break-words text-phos-lt">
                  {String(faixa).padStart(2, "0")}
                </div>
              </div>
              <div className="min-w-0">
                <Silk>nota</Silk>
                <div className="disp tabnum mt-1 text-[clamp(20px,6vw,42px)] leading-tight break-words" style={{ color: lastGrade?.color || "#ffb23f" }}>
                  {lastGrade ? lastGrade.grade : win ? "S" : "F"}
                </div>
              </div>
            </div>

            {lastGrade && (
              <div className="mt-4 module border min-w-0 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-b border-hair pb-2">
                  <Silk lit>relatório de performance da fase</Silk>
                  <span className="font-mono text-[11px] font-bold break-words" style={{ color: lastGrade.color }}>
                    {lastGrade.gradeLabel}
                  </span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] sm:gap-x-6 [&>div]:min-w-0">
                  <div className="break-words text-slate2">Orçamento por tarefa:</div>
                  <div className="text-phos-lt text-right break-words tabnum">{lastGrade.taskBudgetSeconds}s</div>
                  <div className="break-words text-slate2">Média obtida por tarefa:</div>
                  <div className="text-phos-lt text-right break-words tabnum">{lastGrade.averageTaskSeconds}s</div>
                  <div className="break-words text-slate2">Tempo total da fase:</div>
                  <div className="text-phos-lt text-right break-words tabnum">{Math.round(lastGrade.timeSeconds)}s</div>
                  <div className="break-words text-slate2">Integridade remanescente:</div>
                  <div className="text-phos-lt text-right break-words tabnum">{lastGrade.integrityLeft}%</div>
                  <div className="break-words text-slate2">Objetivos selados:</div>
                  <div className="text-phos-lt text-right break-words tabnum">
                    {lastGrade.completedCount}/{lastGrade.objectivesCount}
                  </div>
                  <div className="break-words text-slate2 pt-1 border-t border-hair">Pontuação das tarefas:</div>
                  <div className="text-phos-lt text-right break-words tabnum pt-1 border-t border-hair">
                    {lastGrade.taskScore.toLocaleString("pt-BR")}
                  </div>
                  <div className="break-words text-slate2">Multiplicador da fase:</div>
                  <div className="text-amber text-right break-words tabnum">×{lastGrade.levelMultiplier.toFixed(2)}</div>
                  <div className="break-words text-slate2">Bônus por tempo restante:</div>
                  <div className="text-phos-lt text-right break-words tabnum">+{lastGrade.timeBonus.toLocaleString("pt-BR")}</div>
                  <div className="break-words text-slate2">Bônus por integridade:</div>
                  <div className="text-phos-lt text-right break-words tabnum">+{lastGrade.integrityBonus.toLocaleString("pt-BR")}</div>
                  <div className="break-words text-slate2 pt-1 border-t border-hair col-span-1">Pontuação total da fase:</div>
                  <div className="text-phos text-right break-words tabnum pt-1 border-t border-hair font-bold">
                    {lastGrade.totalScore.toLocaleString("pt-BR")}
                  </div>
                  <div className="break-words text-slate2">Máximo possível:</div>
                  <div className="text-slate text-right break-words tabnum">{lastGrade.maxPossibleForLevel.toLocaleString("pt-BR")}</div>
                </div>
                <div className="mt-2 text-[10.5px] text-slate italic border-t border-hair pt-2 break-words">
                  {lastGrade.message}
                </div>
              </div>
            )}

            {canSave ? (
              <div className="mt-5 min-w-0">
                <Silk>assine o registro do operador</Silk>
                <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                  <input
                    value={nome}
                    onChange={(e) =>
                      setNome(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 3))
                    }
                    placeholder="AAA"
                    aria-label="codinome do operador"
                    className="module w-[120px] px-3 py-3 text-center text-[18px] tracking-[0.34em] text-phos placeholder:text-slate2/60 outline-none"
                  />
                  <Btn onClick={commit} tone="phos">
                    GRAVAR
                  </Btn>
                </div>
              </div>
            ) : (
              <div className="mt-5 flex flex-wrap gap-2">
                {onNext && (
                  <Btn onClick={onNext} tone="phos">
                    PRÓXIMA MISSÃO ▸ <em className="silk not-italic">enter</em>
                  </Btn>
                )}
                <Btn onClick={onRestart} tone={win ? "slate" : "phos"}>
                  {win ? "JOGAR NOVAMENTE" : "REPETIR FASE ATUAL ▸"}
                </Btn>
                {onOpenSelector && (
                  <Btn onClick={onOpenSelector} tone="slate">
                    SELETOR DE MISSÕES
                  </Btn>
                )}
                <Btn onClick={onQuit} tone="slate">
                  MENU PRINCIPAL
                </Btn>
              </div>
            )}
          </div>
          <ScoreTable scores={saved ?? loadScores()} highlight={saved ? 0 : undefined} />
        </div>
      </div>
    </div>
  );
}

function Btn({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone: "phos" | "slate" | "alarm";
}) {
  const c =
    tone === "phos"
      ? "border-phos bg-phos/12 text-phos hover:bg-phos/20"
      : tone === "alarm"
        ? "border-alarm/60 bg-alarm/10 text-alarm hover:bg-alarm/20"
        : "border-hair bg-panel2 text-slate hover:text-phos-lt";
  return (
    <button
      onClick={onClick}
      className={`btn-slab flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 border px-4 py-3.5 text-left text-[12px] tracking-[0.14em] break-words sm:px-5 sm:text-[13px] sm:tracking-[0.16em] [&>em]:shrink-0 ${c}`}
    >
      {children}
    </button>
  );
}

export function Flash({ text }: { text: string | null }) {
  return (
    <AnimatePresence>
      {text && (
        <motion.div
          key={text}
          initial={{ opacity: 0, scale: 1.6, rotate: -6 }}
          animate={{ opacity: 1, scale: 1, rotate: -2 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 420, damping: 18 }}
          className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4"
        >
          <span className="disp max-w-full border-4 border-phos bg-glass/90 px-4 py-3 text-center text-[clamp(20px,5.5vw,64px)] leading-tight break-words text-phos glow sm:px-8 sm:py-4">
            {text}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
