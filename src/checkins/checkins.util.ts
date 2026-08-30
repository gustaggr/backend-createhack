import type { ScoreBand } from '@prisma/client';

// Faixas de score (0-100, 100 = melhor) — iguais para o score geral e para
// cada dimensão. Mantidas isoladas aqui para facilitar ajuste futuro.
export const SCORE_BAND_THRESHOLDS = { STABLE: 70, ATTENTION: 40 } as const;

export function bandFor(score: number): ScoreBand {
  if (score >= SCORE_BAND_THRESHOLDS.STABLE) return 'STABLE';
  if (score >= SCORE_BAND_THRESHOLDS.ATTENTION) return 'ATTENTION';
  return 'PRIORITY';
}

/** 100 − (soma dos pontos / (3 × nº de perguntas)) × 100, arredondado. */
export function scoreFromPoints(totalPoints: number, questionCount: number): number {
  if (questionCount === 0) return 100;
  const raw = 100 - (totalPoints / (3 * questionCount)) * 100;
  return Math.round(raw);
}

export function dateOnlyUTC(date: Date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export function addDaysUTC(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const MAX_RANGE_DAYS = 366;

/** Resolve um intervalo [from, to] (datas puras, sem hora) a partir de query
 * params opcionais — default: os últimos `defaultDays` dias até hoje. */
export function resolveDateRange(
  from: string | undefined,
  to: string | undefined,
  defaultDays = 30,
): { from: Date; to: Date } {
  const today = dateOnlyUTC();
  const toDate = to ? dateOnlyUTC(new Date(to)) : today;
  const fromDate = from ? dateOnlyUTC(new Date(from)) : addDaysUTC(toDate, -(defaultDays - 1));

  if (Number.isNaN(toDate.getTime()) || Number.isNaN(fromDate.getTime())) {
    throw new Error('Datas inválidas');
  }
  if (fromDate > toDate) {
    throw new Error('A data inicial não pode ser depois da data final');
  }
  const spanDays = Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1;
  if (spanDays > MAX_RANGE_DAYS) {
    throw new Error(`O intervalo não pode passar de ${MAX_RANGE_DAYS} dias`);
  }

  return { from: fromDate, to: toDate };
}
