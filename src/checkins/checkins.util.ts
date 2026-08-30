import type { QuestionDimension, ScoreBand } from '@prisma/client';

// Faixas de score (0-100, 100 = melhor) — iguais para o score geral e para
// cada dimensão. Mantidas isoladas aqui para facilitar ajuste futuro.
export const SCORE_BAND_THRESHOLDS = { STABLE: 70, ATTENTION: 40 } as const;

export function bandFor(score: number): ScoreBand {
  if (score >= SCORE_BAND_THRESHOLDS.STABLE) return 'STABLE';
  if (score >= SCORE_BAND_THRESHOLDS.ATTENTION) return 'ATTENTION';
  return 'PRIORITY';
}

// Limite que dispara o webhook de alerta de score baixo (independente das
// faixas acima, que também controlam o "needsAttention" do dashboard).
export const SCORE_ALERT_THRESHOLD = 60;

const DIMENSION_LABELS: Record<QuestionDimension, string> = {
  PHYSICAL: 'físico',
  EMOTIONAL: 'emocional',
  SPIRITUAL: 'espiritual',
  MINISTRY: 'ministerial',
  RELATIONAL: 'relacional',
};

/** Monta a mensagem de "o que o líder precisa olhar agora" para o webhook de
 * alerta de score baixo, priorizando as esferas em pior situação. */
export function buildScoreAlertConcern(
  overallScore: number,
  dimensions: { dimension: QuestionDimension; value: number; band: ScoreBand }[],
): string {
  const priority = dimensions.filter((d) => d.band === 'PRIORITY').sort((a, b) => a.value - b.value);
  const attention = dimensions.filter((d) => d.band === 'ATTENTION').sort((a, b) => a.value - b.value);

  if (priority.length > 0) {
    const names = priority.map((d) => DIMENSION_LABELS[d.dimension]).join(', ');
    return `Score geral em ${overallScore} (abaixo de ${SCORE_ALERT_THRESHOLD}). Esfera(s) em prioridade de cuidado: ${names}. O líder deve procurar este missionário hoje.`;
  }
  if (attention.length > 0) {
    const names = attention.map((d) => DIMENSION_LABELS[d.dimension]).join(', ');
    return `Score geral em ${overallScore} (abaixo de ${SCORE_ALERT_THRESHOLD}). Esfera(s) em atenção: ${names}. Vale uma conversa próxima nos próximos dias.`;
  }
  return `Score geral em ${overallScore} (abaixo de ${SCORE_ALERT_THRESHOLD}). Vale uma conversa de acompanhamento com o missionário.`;
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
