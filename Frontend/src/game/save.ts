// INITIUM — Sistema de Salvamento Persistente e Gerenciador de Progresso (v2)
import { LEVELS } from "./model";

/** Total de fases da campanha — derivado do modelo para nunca ficar dessincronizado. */
const TOTAL_LEVELS = LEVELS.length;

export type SaveData = {
  version: 2;
  currentLevelIndex: number;
  unlockedLevelIndices: number[];
  completedLevelIndices: number[];
  score: number;
  totalPlayTimeSeconds: number;
  lastSavedAt: string;
  levelHighScores: Record<number, number>;
  levelGrades?: Record<number, string>;
  /** contador único global restante (segundos) — preserva a operação ao retomar */
  globalClockRemaining?: number;
  /** integridade nacional no momento do save */
  integrityRemaining?: number;
  activeObjectiveIds?: string[];
  operatorName?: string;
};

const STORAGE_KEY = "initium.save.v2";
const LEGACY_KEY = "initium.save.v1";

export function getFreshSave(): SaveData {
  return {
    version: 2,
    currentLevelIndex: 0,
    unlockedLevelIndices: [0],
    completedLevelIndices: [],
    score: 0,
    totalPlayTimeSeconds: 0,
    lastSavedAt: new Date().toISOString(),
    levelHighScores: {},
    operatorName: "OPS",
  };
}

export function loadGameSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SaveData;
      if (parsed && typeof parsed.currentLevelIndex === "number") {
        if (!Array.isArray(parsed.unlockedLevelIndices)) parsed.unlockedLevelIndices = [0];
        if (!parsed.unlockedLevelIndices.includes(0)) parsed.unlockedLevelIndices.push(0);
        // Sanitiza saves de campanhas anteriores (mais longas): descarta índices
        // de fases que não existem mais e limita a fase atual ao total vigente.
        const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < TOTAL_LEVELS;
        parsed.unlockedLevelIndices = parsed.unlockedLevelIndices.filter(inRange);
        if (!parsed.unlockedLevelIndices.length) parsed.unlockedLevelIndices = [0];
        parsed.completedLevelIndices = (parsed.completedLevelIndices ?? []).filter(inRange);
        parsed.currentLevelIndex = Math.min(Math.max(0, parsed.currentLevelIndex), TOTAL_LEVELS - 1);
        return parsed;
      }
    }

    // fallback de versão anterior se houver
    const leg = localStorage.getItem(LEGACY_KEY);
    if (leg) {
      const p = JSON.parse(leg);
      if (typeof p?.level === "number") {
        return {
          version: 2,
          currentLevelIndex: Math.max(0, p.level - 1),
          unlockedLevelIndices: Array.from({ length: Math.max(1, p.level) }, (_, i) => i),
          completedLevelIndices: [],
          score: p.score || 0,
          totalPlayTimeSeconds: 0,
          lastSavedAt: new Date().toISOString(),
          levelHighScores: {},
          operatorName: "OPS",
        };
      }
    }
  } catch {
    // armazenamento local desabilitado ou corrompido
  }
  return null;
}

export function saveGameProgress(
  levelIndex: number,
  score: number,
  options?: {
    markCompleted?: boolean;
    playTimeSecondsDelta?: number;
    operatorName?: string;
    grade?: string;
    clock?: number;
    integrity?: number;
  }
): SaveData {
  const current = loadGameSave() ?? getFreshSave();

  current.currentLevelIndex = levelIndex;
  current.score = Math.max(current.score, score);

  if (!current.unlockedLevelIndices.includes(levelIndex)) {
    current.unlockedLevelIndices.push(levelIndex);
    current.unlockedLevelIndices.sort((a, b) => a - b);
  }

  if (options?.markCompleted) {
    if (!current.completedLevelIndices.includes(levelIndex)) {
      current.completedLevelIndices.push(levelIndex);
      current.completedLevelIndices.sort((a, b) => a - b);
    }
    // Desbloqueia a próxima fase automaticamente se houver
    const nextIdx = levelIndex + 1;
    if (nextIdx < TOTAL_LEVELS && !current.unlockedLevelIndices.includes(nextIdx)) {
      current.unlockedLevelIndices.push(nextIdx);
      current.unlockedLevelIndices.sort((a, b) => a - b);
    }
  }

  // Guarda melhor nota e pontuação por fase
  current.levelHighScores = current.levelHighScores || {};
  const prev = current.levelHighScores[levelIndex] || 0;
  if (score > prev) current.levelHighScores[levelIndex] = score;

  if (options?.grade) {
    current.levelGrades = current.levelGrades || {};
    const order = ["S", "A", "B", "C", "F"];
    const existing = current.levelGrades[levelIndex];
    if (!existing || order.indexOf(options.grade) < order.indexOf(existing)) {
      current.levelGrades[levelIndex] = options.grade;
    }
  }

  if (options?.playTimeSecondsDelta) {
    current.totalPlayTimeSeconds = (current.totalPlayTimeSeconds || 0) + options.playTimeSecondsDelta;
  }

  if (options?.clock !== undefined) {
    current.globalClockRemaining = Math.max(0, Math.round(options.clock * 100) / 100);
  }
  if (options?.integrity !== undefined) {
    current.integrityRemaining = Math.max(0, Math.round(options.integrity * 100) / 100);
  }

  if (options?.operatorName) {
    current.operatorName = options.operatorName;
  }

  current.lastSavedAt = new Date().toISOString();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* falha silenciosa em sandboxes restritivos */
  }

  return current;
}

export function resetGameProgress(): SaveData {
  const fresh = getFreshSave();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  } catch {
    /* ignore */
  }
  return fresh;
}
