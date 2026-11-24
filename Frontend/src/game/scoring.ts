// INITIUM — Sistema de pontuação por tarefa, baseado no tempo de cada contenção
import { TASK_TIME_BUDGET } from "./model";

export type Grade = "S" | "A" | "B" | "C" | "F";
export type TaskGrade = "S" | "A" | "B" | "C" | "D";

/** Pontos base de cada tarefa antes dos multiplicadores. */
export const TASK_BASE_SCORE = 500;

export type TaskTier = {
  grade: TaskGrade;
  /** tempo máximo (em segundos) para cair nesta faixa */
  maxSeconds: number;
  multiplier: number;
  label: string;
};

/**
 * Faixas de tempo POR TAREFA — quanto mais rápido a contenção, maior a nota.
 * O relógio da tarefa começa no início da fase (ou na conclusão da tarefa
 * anterior) e corre até o comando que fecha o requisito final.
 */
export const TASK_TIERS: TaskTier[] = [
  { grade: "S", maxSeconds: 12, multiplier: 3.0, label: "S · RESPOSTA INSTANTÂNEA" },
  { grade: "A", maxSeconds: 30, multiplier: 2.2, label: "A · RESPOSTA RÁPIDA" },
  { grade: "B", maxSeconds: 60, multiplier: 1.6, label: "B · RESPOSTA PADRÃO" },
  { grade: "C", maxSeconds: 120, multiplier: 1.15, label: "C · RESPOSTA LENTA" },
  { grade: "D", maxSeconds: Infinity, multiplier: 0.75, label: "D · RESPOSTA TARDIA" },
];

export function getTaskTier(seconds: number): TaskTier {
  return TASK_TIERS.find((t) => seconds <= t.maxSeconds) ?? TASK_TIERS[TASK_TIERS.length - 1];
}

export type TaskScore = {
  grade: TaskGrade;
  gradeLabel: string;
  multiplier: number;
  /** segundos gastos na tarefa */
  seconds: number;
  baseScore: number;
  /** baseScore × multiplier (sem o multiplicador de cadeia) */
  score: number;
};

/** Avalia uma tarefa individual pelo tempo que ela levou para ser concluída. */
export function evaluateTaskPerformance(seconds: number): TaskScore {
  const safe = Math.max(0, seconds);
  const tier = getTaskTier(safe);
  return {
    grade: tier.grade,
    gradeLabel: tier.label,
    multiplier: tier.multiplier,
    seconds: Math.round(safe),
    baseScore: TASK_BASE_SCORE,
    score: Math.round(TASK_BASE_SCORE * tier.multiplier),
  };
}

/**
 * Nota da fase derivada do tempo MÉDIO por tarefa em relação ao orçamento.
 * - S: média ≤ 30% do orçamento (resposta de elite)
 * - A: ≤ 55%
 * - B: ≤ 80%
 * - C: ≤ 100%
 * - F: acima do orçamento ou tarefas incompletas
 */
const LEVEL_TIERS: { grade: Grade; ratio: number; multiplier: number; label: string }[] = [
  { grade: "S", ratio: 0.3, multiplier: 2.6, label: "S · CONTENÇÃO DE ELITE" },
  { grade: "A", ratio: 0.55, multiplier: 1.8, label: "A · CONTENÇÃO COMPETENTE" },
  { grade: "B", ratio: 0.8, multiplier: 1.3, label: "B · CONTENÇÃO ADEQUADA" },
  { grade: "C", ratio: 1.0, multiplier: 0.9, label: "C · CONTENÇÃO NO LIMITE" },
];

export type LevelScoreBreakdown = {
  grade: Grade;
  gradeLabel: string;
  /** pontuação final da fase */
  totalScore: number;
  /** soma dos pontos obtidos em cada tarefa (com multiplicador de cadeia) */
  taskScore: number;
  /** multiplicador aplicado sobre a soma das tarefas, conforme o tempo médio */
  levelMultiplier: number;
  /** bônus pelo tempo restante da janela tática */
  timeBonus: number;
  /** bônus pela integridade remanescente */
  integrityBonus: number;
  timeSeconds: number;
  averageTaskSeconds: number;
  taskBudgetSeconds: number;
  integrityLeft: number;
  objectivesCount: number;
  completedCount: number;
  maxPossibleForLevel: number;
  message: string;
  color: string;
};

export function evaluateLevelPerformance(params: {
  timeSpentSeconds: number;
  remainingIntegrityPct: number;
  objectivesCompletedCount: number;
  objectivesTotalCount: number;
  /** soma dos pontos obtidos nas tarefas individuais */
  taskScore: number;
  /** segundos gastos em cada tarefa concluída */
  taskTimes?: number[];
}): LevelScoreBreakdown {
  const {
    timeSpentSeconds,
    remainingIntegrityPct,
    objectivesCompletedCount,
    objectivesTotalCount,
    taskScore,
    taskTimes = [],
  } = params;

  const allDone = objectivesCompletedCount >= objectivesTotalCount;
  const budget = TASK_TIME_BUDGET;
  const avg = taskTimes.length
    ? taskTimes.reduce((a, b) => a + b, 0) / taskTimes.length
    : timeSpentSeconds / Math.max(1, objectivesTotalCount);

  let grade: Grade;
  let levelMultiplier: number;
  let gradeLabel: string;
  let message: string;
  let color: string;

  if (!allDone) {
    grade = "F";
    levelMultiplier = 0.35;
    gradeLabel = "F · FALHA TÁTICA";
    message = "Vetores hostis não foram completamente neutralizados.";
    color = "#ff4d2e";
  } else {
    const ratio = budget > 0 ? avg / budget : 1;
    const tier = LEVEL_TIERS.find((t) => ratio <= t.ratio) ?? {
      grade: "C" as Grade,
      multiplier: 0.9,
      label: "C · CONTENÇÃO NO LIMITE",
    };
    grade = tier.grade;
    levelMultiplier = tier.multiplier;
    gradeLabel = tier.label;
    message =
      tier.grade === "S"
        ? `Média de ${Math.round(avg)}s por tarefa contra ${budget}s de orçamento: resposta de elite.`
        : tier.grade === "A"
          ? `Média de ${Math.round(avg)}s por tarefa — contenção rápida e limpa.`
          : tier.grade === "B"
            ? `Média de ${Math.round(avg)}s por tarefa — dentro do padrão operacional.`
            : `Média de ${Math.round(avg)}s por tarefa — contenção no limite do orçamento.`;
    color =
      tier.grade === "S" ? "#39ff88" : tier.grade === "A" ? "#8cffc0" : tier.grade === "B" ? "#ffb23f" : "#ff4d2e";
  }

  const timeBonus = Math.round(
    Math.max(0, budget - avg) * Math.max(1, objectivesTotalCount) * 8
  );
  const integrityBonus = Math.round(Math.max(0, remainingIntegrityPct) * 5);
  const totalScore = Math.round(taskScore * levelMultiplier + timeBonus + integrityBonus);

  const maxPossibleForLevel = Math.round(
    objectivesTotalCount * TASK_BASE_SCORE * 3.0 * 2.6 +
      budget * objectivesTotalCount * 8 +
      100 * 5
  );

  return {
    grade,
    gradeLabel,
    totalScore,
    taskScore: Math.round(taskScore),
    levelMultiplier,
    timeBonus,
    integrityBonus,
    timeSeconds: Math.round(timeSpentSeconds),
    averageTaskSeconds: Math.round(avg),
    taskBudgetSeconds: budget,
    integrityLeft: Math.max(0, Math.round(remainingIntegrityPct)),
    objectivesCount: objectivesTotalCount,
    completedCount: objectivesCompletedCount,
    maxPossibleForLevel,
    message,
    color,
  };
}

/** Contador global no formato H:MM:SS (a campanha dura 1h30). */
export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
