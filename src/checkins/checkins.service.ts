import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { QuestionDimension } from '@prisma/client';
import { AuditService } from '../audit/audit.service.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { GroupsService } from '../groups/groups.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  addDaysUTC,
  bandFor,
  dateOnlyUTC,
  isoDate,
  resolveDateRange,
  scoreFromPoints,
} from './checkins.util.js';
import type { SubmitAnswersDto } from './dto/submit-answers.dto.js';

interface QuestionOption {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
  points?: 0 | 1 | 2 | 3;
}

const CRITICAL_SUPPORT_MESSAGE = {
  title: 'Você não está sozinho(a)',
  message:
    'O que você sentiu agora é sério, e merece cuidado humano de verdade — não só um app. Por favor, fale agora com seu líder ou com alguém de confiança. Se você sente que está em perigo imediato, procure ajuda de emergência na sua região agora.',
};

@Injectable()
export class CheckinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly groupsService: GroupsService,
  ) {}

  private async getTodaysSetNumber(): Promise<number> {
    const sets = await this.prisma.question.findMany({
      distinct: ['setNumber'],
      select: { setNumber: true },
      orderBy: { setNumber: 'asc' },
    });
    if (sets.length === 0) {
      throw new NotFoundException('Nenhum conjunto de perguntas cadastrado ainda');
    }
    const dayIndex = Math.floor(Date.now() / 86_400_000);
    return sets[dayIndex % sets.length].setNumber;
  }

  async getToday(missionaryId: string) {
    const today = dateOnlyUTC();

    const existing = await this.prisma.dailyCheckin.findUnique({
      where: { missionaryId_checkinDate: { missionaryId, checkinDate: today } },
      include: { dimensionScores: true },
    });

    if (existing) {
      return {
        status: 'COMPLETED' as const,
        overallScore: existing.overallScore,
        overallBand: existing.overallBand,
        hasCriticalAlert: existing.hasCriticalAlert,
        dimensions: existing.dimensionScores.map((d) => ({
          dimension: d.dimension,
          value: d.value,
          band: d.band,
        })),
      };
    }

    const setNumber = await this.getTodaysSetNumber();
    const questions = await this.prisma.question.findMany({
      where: { setNumber, status: 'ACTIVE' },
      orderBy: { order: 'asc' },
    });

    return {
      status: 'PENDING' as const,
      questions: questions.map((q) => ({
        id: q.id,
        order: q.order,
        type: q.type,
        dimension: q.dimension,
        text: q.text,
        options: q.options
          ? (q.options as unknown as QuestionOption[]).map((o) => ({ label: o.label, text: o.text }))
          : null,
        dependsOnOrder: q.dependsOnOrder,
        skipWhenOption: q.skipWhenOption,
      })),
    };
  }

  async submitAnswers(
    missionaryId: string,
    institutionId: string,
    dto: SubmitAnswersDto,
    meta: { ipAddress?: string },
  ) {
    const today = dateOnlyUTC();

    const alreadyAnswered = await this.prisma.dailyCheckin.findUnique({
      where: { missionaryId_checkinDate: { missionaryId, checkinDate: today } },
    });
    if (alreadyAnswered) {
      throw new ConflictException('Você já respondeu o quest de hoje');
    }

    const setNumber = await this.getTodaysSetNumber();
    const questions = await this.prisma.question.findMany({
      where: { setNumber, status: 'ACTIVE' },
      orderBy: { order: 'asc' },
    });

    const questionByOrder = new Map(questions.map((q) => [q.order, q]));
    const dtoAnswerByQuestionId = new Map(dto.answers.map((a) => [a.questionId, a]));

    // Uma pergunta condicional (dependsOnOrder) não é obrigatória quando a
    // resposta da pergunta da qual ela depende for exatamente skipWhenOption
    // (ex.: pergunta 12 só existe se a 11 não foi "Não fiz devocional").
    function isSkipped(question: (typeof questions)[number]): boolean {
      if (question.dependsOnOrder == null) return false;
      const dependency = questionByOrder.get(question.dependsOnOrder);
      const dependencyAnswer = dependency ? dtoAnswerByQuestionId.get(dependency.id) : undefined;
      return dependencyAnswer?.selectedOption === question.skipWhenOption;
    }

    let overallPoints = 0;
    let scoredQuestionCount = 0;
    const pointsByDimension = new Map<QuestionDimension, { points: number; count: number }>();
    const answerRows: {
      questionId: string;
      selectedOption?: string;
      textAnswer?: string;
      points?: number;
    }[] = [];
    let redFlagOption: string | null = null;

    for (const question of questions) {
      if (isSkipped(question)) continue;

      const answer = dtoAnswerByQuestionId.get(question.id);
      if (!answer) {
        throw new BadRequestException(`Resposta obrigatória ausente para a pergunta ${question.order}`);
      }

      if (question.type === 'OPEN_TEXT') {
        const textAnswer = answer.textAnswer?.trim();
        if (!textAnswer) {
          throw new BadRequestException(`Resposta em texto obrigatória para a pergunta ${question.order}`);
        }
        answerRows.push({ questionId: question.id, textAnswer });
        continue;
      }

      const options = (question.options as unknown as QuestionOption[] | null) ?? [];
      const option = options.find((o) => o.label === answer.selectedOption);
      if (!option) {
        throw new BadRequestException(`Opção inválida para a pergunta ${question.order}`);
      }

      if (question.type === 'SCORED_CHOICE') {
        const points = option.points ?? 0;
        overallPoints += points;
        scoredQuestionCount += 1;
        answerRows.push({ questionId: question.id, selectedOption: option.label, points });

        if (question.dimension) {
          const bucket = pointsByDimension.get(question.dimension) ?? { points: 0, count: 0 };
          bucket.points += points;
          bucket.count += 1;
          pointsByDimension.set(question.dimension, bucket);
        }
      } else {
        answerRows.push({ questionId: question.id, selectedOption: option.label });
      }

      if (question.isRedFlag) {
        redFlagOption = option.label;
      }
    }

    const overallScore = scoreFromPoints(overallPoints, scoredQuestionCount);
    const overallBand = bandFor(overallScore);

    const dimensionResults = Array.from(pointsByDimension.entries()).map(([dimension, bucket]) => {
      const value = scoreFromPoints(bucket.points, bucket.count);
      return { dimension, value, band: bandFor(value) };
    });

    const hasCriticalAlert = redFlagOption === 'D';
    const careEventSeverity =
      redFlagOption === 'D' ? 'CRITICAL' : redFlagOption === 'B' || redFlagOption === 'C' ? 'ATTENTION' : null;

    const checkin = await this.prisma.$transaction(async (tx) => {
      const created = await tx.dailyCheckin.create({
        data: {
          missionaryId,
          institutionId,
          checkinDate: today,
          setNumber,
          status: 'COMPLETED',
          overallScore,
          overallBand,
          hasCriticalAlert,
          completedAt: new Date(),
          answers: { createMany: { data: answerRows } },
          dimensionScores: { createMany: { data: dimensionResults } },
        },
      });

      if (careEventSeverity) {
        await tx.careEvent.create({
          data: {
            institutionId,
            missionaryId,
            checkinId: created.id,
            severity: careEventSeverity,
            reason: 'Resposta de atenção na pergunta sobre pensamentos de autolesão (check-in diário)',
          },
        });
      }

      return created;
    });

    await this.audit.log({
      actorUserId: missionaryId,
      action: 'checkin.completed',
      entityType: 'DailyCheckin',
      entityId: checkin.id,
      metadata: { overallScore, overallBand, hasCriticalAlert },
      ipAddress: meta.ipAddress,
    });

    return {
      overallScore,
      overallBand,
      dimensions: dimensionResults,
      hasCriticalAlert,
      criticalSupport: hasCriticalAlert ? CRITICAL_SUPPORT_MESSAGE : null,
    };
  }

  async getStreak(missionaryId: string) {
    const today = dateOnlyUTC();
    const since = addDaysUTC(today, -30);

    const checkins = await this.prisma.dailyCheckin.findMany({
      where: { missionaryId, status: 'COMPLETED', checkinDate: { gte: since } },
      select: { checkinDate: true },
    });
    const answeredDates = new Set(checkins.map((c) => c.checkinDate.toISOString().slice(0, 10)));

    const isoOf = (d: Date) => d.toISOString().slice(0, 10);

    let cursor = answeredDates.has(isoOf(today)) ? today : addDaysUTC(today, -1);
    let currentStreak = 0;
    while (answeredDates.has(isoOf(cursor))) {
      currentStreak += 1;
      cursor = addDaysUTC(cursor, -1);
    }

    const last7Days: boolean[] = [];
    for (let i = 6; i >= 0; i--) {
      last7Days.push(answeredDates.has(isoOf(addDaysUTC(today, -i))));
    }

    return { currentStreak, last7Days };
  }

  async getGroupCheckinsToday(institutionId: string, groupId: string, actor: AuthenticatedUser) {
    const group = await this.groupsService.findById(groupId, actor);
    const today = dateOnlyUTC();
    const since = addDaysUTC(today, -6);

    const results = await Promise.all(
      group.members.map(async (member) => {
        const recentCheckins = await this.prisma.dailyCheckin.findMany({
          where: {
            missionaryId: member.id,
            status: 'COMPLETED',
            checkinDate: { gte: since, lte: today },
          },
          include: { dimensionScores: true },
          orderBy: { checkinDate: 'desc' },
        });

        const todayIso = today.toISOString().slice(0, 10);
        const todayCheckin = recentCheckins.find(
          (c) => c.checkinDate.toISOString().slice(0, 10) === todayIso,
        );

        if (!todayCheckin) {
          return { missionaryId: member.id, fullName: member.fullName, answeredToday: false };
        }

        const previous = recentCheckins.filter((c) => c.id !== todayCheckin.id);
        let trend: 'IMPROVING' | 'STABLE' | 'WORSENING' = 'STABLE';
        if (previous.length > 0) {
          const avgPrevious =
            previous.reduce((sum, c) => sum + (c.overallScore ?? 0), 0) / previous.length;
          const diff = (todayCheckin.overallScore ?? 0) - avgPrevious;
          if (diff > 5) trend = 'IMPROVING';
          else if (diff < -5) trend = 'WORSENING';
        }

        return {
          missionaryId: member.id,
          fullName: member.fullName,
          answeredToday: true,
          overallScore: todayCheckin.overallScore,
          overallBand: todayCheckin.overallBand,
          hasCriticalAlert: todayCheckin.hasCriticalAlert,
          dimensions: todayCheckin.dimensionScores.map((d) => ({
            dimension: d.dimension,
            value: d.value,
            band: d.band,
          })),
          trend,
        };
      }),
    );

    return results;
  }

  /** Tendência do dashboard inicial — fixo em 14 dias, fácil de ajustar depois. */
  private static readonly DASHBOARD_TREND_DAYS = 14;

  private async buildOverview(missionaryIds: string[], days: number) {
    const today = dateOnlyUTC();
    const since = addDaysUTC(today, -(days - 1));
    const totalMissionaries = missionaryIds.length;

    const emptyBands = { STABLE: 0, ATTENTION: 0, PRIORITY: 0 };
    if (totalMissionaries === 0) {
      return {
        trend: [],
        todayAnsweredCount: 0,
        totalMissionaries: 0,
        bandDistributionToday: emptyBands,
        openCareEvents: 0,
        criticalOpenCareEvents: 0,
        needsAttention: [] as {
          missionaryId: string;
          institutionId: string;
          fullName: string;
          reason: string;
          severity: 'ATTENTION' | 'CRITICAL';
        }[],
      };
    }

    const checkinsInRange = await this.prisma.dailyCheckin.findMany({
      where: {
        missionaryId: { in: missionaryIds },
        status: 'COMPLETED',
        checkinDate: { gte: since, lte: today },
      },
      select: {
        missionaryId: true,
        institutionId: true,
        checkinDate: true,
        overallScore: true,
        overallBand: true,
      },
    });

    const scoresByDate = new Map<string, number[]>();
    for (const c of checkinsInRange) {
      if (c.overallScore == null) continue;
      const iso = isoDate(c.checkinDate);
      const arr = scoresByDate.get(iso) ?? [];
      arr.push(c.overallScore);
      scoresByDate.set(iso, arr);
    }

    const trend: { date: string; avgScore: number | null }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const iso = isoDate(addDaysUTC(today, -i));
      const scores = scoresByDate.get(iso);
      trend.push({
        date: iso,
        avgScore: scores?.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      });
    }

    const todayIso = isoDate(today);
    const todayCheckins = checkinsInRange.filter((c) => isoDate(c.checkinDate) === todayIso);
    const bandDistributionToday = { ...emptyBands };
    for (const c of todayCheckins) {
      if (c.overallBand) bandDistributionToday[c.overallBand] += 1;
    }

    const openEvents = await this.prisma.careEvent.findMany({
      where: { missionaryId: { in: missionaryIds }, status: 'OPEN' },
      include: { missionary: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const attentionMap = new Map<
      string,
      {
        missionaryId: string;
        institutionId: string;
        fullName: string;
        reason: string;
        severity: 'ATTENTION' | 'CRITICAL';
      }
    >();
    for (const e of openEvents) {
      if (e.severity !== 'CRITICAL') continue;
      attentionMap.set(e.missionaryId, {
        missionaryId: e.missionaryId,
        institutionId: e.institutionId,
        fullName: e.missionary.fullName,
        reason: 'Evento de cuidado crítico em aberto',
        severity: 'CRITICAL',
      });
    }

    const bandFlagged = todayCheckins.filter(
      (c) => c.overallBand === 'ATTENTION' || c.overallBand === 'PRIORITY',
    );
    const missingNameIds = bandFlagged
      .map((c) => c.missionaryId)
      .filter((id) => !attentionMap.has(id));
    if (missingNameIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { id: { in: missingNameIds } },
        select: { id: true, fullName: true },
      });
      const nameById = new Map(users.map((u) => [u.id, u.fullName]));
      for (const c of bandFlagged) {
        if (attentionMap.has(c.missionaryId)) continue;
        attentionMap.set(c.missionaryId, {
          missionaryId: c.missionaryId,
          institutionId: c.institutionId,
          fullName: nameById.get(c.missionaryId) ?? '—',
          reason:
            c.overallBand === 'PRIORITY'
              ? 'Score de hoje em prioridade de cuidado'
              : 'Score de hoje em atenção',
          severity: c.overallBand === 'PRIORITY' ? 'CRITICAL' : 'ATTENTION',
        });
      }
    }

    return {
      trend,
      todayAnsweredCount: todayCheckins.length,
      totalMissionaries,
      bandDistributionToday,
      openCareEvents: openEvents.length,
      criticalOpenCareEvents: openEvents.filter((e) => e.severity === 'CRITICAL').length,
      needsAttention: Array.from(attentionMap.values()).slice(0, 8),
    };
  }

  async getLeaderOverview(actor: AuthenticatedUser) {
    const leaderInstitutionIds = actor.roles
      .filter((r) => r.role === 'LEADER' && r.status === 'ACTIVE' && r.institutionId)
      .map((r) => r.institutionId as string);
    if (leaderInstitutionIds.length === 0) {
      throw new ForbiddenException('Você não tem um papel de líder ativo');
    }

    const memberships = await this.prisma.groupMembership.findMany({
      where: {
        status: 'ACTIVE',
        group: { leaderId: actor.id, institutionId: { in: leaderInstitutionIds } },
      },
      select: { missionaryId: true },
    });
    const missionaryIds = Array.from(new Set(memberships.map((m) => m.missionaryId)));

    return this.buildOverview(missionaryIds, CheckinsService.DASHBOARD_TREND_DAYS);
  }

  async getInstitutionOverview(institutionId: string, actor: AuthenticatedUser) {
    const isSuperAdmin = actor.roles.some((r) => r.role === 'SUPER_ADMIN' && r.status === 'ACTIVE');
    const isInstitutionAdmin = actor.roles.some(
      (r) => r.role === 'INSTITUTION_ADMIN' && r.status === 'ACTIVE' && r.institutionId === institutionId,
    );
    if (!isSuperAdmin && !isInstitutionAdmin) {
      throw new ForbiddenException('Você não pode ver o painel desta instituição');
    }

    const roles = await this.prisma.userRole.findMany({
      where: { institutionId, role: 'MISSIONARY', status: 'ACTIVE' },
      select: { userId: true },
    });

    return this.buildOverview(
      roles.map((r) => r.userId),
      CheckinsService.DASHBOARD_TREND_DAYS,
    );
  }

  async getPlatformOverview() {
    const roles = await this.prisma.userRole.findMany({
      where: { role: 'MISSIONARY', status: 'ACTIVE' },
      select: { userId: true },
    });
    const missionaryIds = Array.from(new Set(roles.map((r) => r.userId)));

    return this.buildOverview(missionaryIds, CheckinsService.DASHBOARD_TREND_DAYS);
  }

  private async canManageMissionary(
    institutionId: string,
    missionaryId: string,
    actor: AuthenticatedUser,
  ): Promise<boolean> {
    const isSuperAdmin = actor.roles.some((r) => r.role === 'SUPER_ADMIN' && r.status === 'ACTIVE');
    const isInstitutionAdmin = actor.roles.some(
      (r) => r.role === 'INSTITUTION_ADMIN' && r.status === 'ACTIVE' && r.institutionId === institutionId,
    );
    if (isSuperAdmin || isInstitutionAdmin) return true;

    const isLeader = actor.roles.some(
      (r) => r.role === 'LEADER' && r.status === 'ACTIVE' && r.institutionId === institutionId,
    );
    if (!isLeader) return false;

    const membership = await this.prisma.groupMembership.findFirst({
      where: { missionaryId, status: 'ACTIVE', group: { institutionId, leaderId: actor.id } },
    });
    return !!membership;
  }

  async getMissionaryProfile(
    institutionId: string,
    missionaryId: string,
    actor: AuthenticatedUser,
    dateRange?: { from?: string; to?: string },
  ) {
    const allowed = await this.canManageMissionary(institutionId, missionaryId, actor);
    if (!allowed) {
      throw new ForbiddenException('Você não pode ver o perfil deste missionário');
    }

    let from: Date;
    let to: Date;
    try {
      ({ from, to } = resolveDateRange(dateRange?.from, dateRange?.to));
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Intervalo de datas inválido');
    }

    const missionary = await this.prisma.user.findUnique({
      where: { id: missionaryId },
      select: { id: true, fullName: true, preferredName: true, email: true },
    });
    if (!missionary) {
      throw new NotFoundException('Missionário não encontrado');
    }

    const membership = await this.prisma.groupMembership.findFirst({
      where: { missionaryId, status: 'ACTIVE', group: { institutionId } },
      include: { group: { select: { id: true, name: true, leader: { select: { fullName: true } } } } },
    });

    const checkins = await this.prisma.dailyCheckin.findMany({
      where: { missionaryId, institutionId, checkinDate: { gte: from, lte: to } },
      orderBy: { checkinDate: 'desc' },
      include: {
        dimensionScores: true,
        answers: { include: { question: true }, orderBy: { question: { order: 'asc' } } },
      },
    });

    const careEvents = await this.prisma.careEvent.findMany({
      where: {
        missionaryId,
        institutionId,
        createdAt: { gte: from, lt: addDaysUTC(to, 1) },
      },
      orderBy: { createdAt: 'desc' },
    });

    const withScore = checkins.filter((c) => c.overallScore != null);
    const overallAvg = withScore.length
      ? Math.round(withScore.reduce((sum, c) => sum + (c.overallScore ?? 0), 0) / withScore.length)
      : null;

    const dimensionSums = new Map<QuestionDimension, { sum: number; count: number }>();
    for (const c of checkins) {
      for (const d of c.dimensionScores) {
        const bucket = dimensionSums.get(d.dimension) ?? { sum: 0, count: 0 };
        bucket.sum += d.value;
        bucket.count += 1;
        dimensionSums.set(d.dimension, bucket);
      }
    }
    const dimensionAverages = Array.from(dimensionSums.entries()).map(([dimension, bucket]) => ({
      dimension,
      avg: Math.round(bucket.sum / bucket.count),
    }));

    const checkinByDate = new Map(checkins.map((c) => [isoDate(c.checkinDate), c]));
    const daysInRange: { date: string; status: 'ANSWERED' | 'MISSING' | 'CRITICAL' }[] = [];
    for (let cursor = from; cursor <= to; cursor = addDaysUTC(cursor, 1)) {
      const iso = isoDate(cursor);
      const checkin = checkinByDate.get(iso);
      daysInRange.push({
        date: iso,
        status: !checkin ? 'MISSING' : checkin.hasCriticalAlert ? 'CRITICAL' : 'ANSWERED',
      });
    }
    const blankDates = daysInRange.filter((d) => d.status === 'MISSING').map((d) => d.date);

    return {
      missionary,
      group: membership
        ? { id: membership.group.id, name: membership.group.name, leaderName: membership.group.leader.fullName }
        : null,
      range: { from: isoDate(from), to: isoDate(to) },
      averages: { overallAvg, dimensions: dimensionAverages },
      daysInRange,
      blankDaysCount: blankDates.length,
      blankDates,
      careEvents,
      checkins: checkins.map((c) => ({
        id: c.id,
        checkinDate: c.checkinDate,
        overallScore: c.overallScore,
        overallBand: c.overallBand,
        hasCriticalAlert: c.hasCriticalAlert,
        dimensions: c.dimensionScores.map((d) => ({
          dimension: d.dimension,
          value: d.value,
          band: d.band,
        })),
        answers: c.answers.map((a) => {
          const options = (a.question.options as unknown as QuestionOption[] | null) ?? [];
          const option = options.find((o) => o.label === a.selectedOption);
          return {
            questionOrder: a.question.order,
            questionText: a.question.text,
            dimension: a.question.dimension,
            selectedOption: a.selectedOption,
            selectedOptionText: option?.text ?? null,
            textAnswer: a.textAnswer,
          };
        }),
      })),
    };
  }

  async listCareEvents(institutionId: string, actor: AuthenticatedUser) {
    const isSuperAdmin = actor.roles.some((r) => r.role === 'SUPER_ADMIN' && r.status === 'ACTIVE');
    const isInstitutionAdmin = actor.roles.some(
      (r) => r.role === 'INSTITUTION_ADMIN' && r.status === 'ACTIVE' && r.institutionId === institutionId,
    );

    let missionaryIdFilter: string[] | undefined;
    if (!isSuperAdmin && !isInstitutionAdmin) {
      const isLeader = actor.roles.some(
        (r) => r.role === 'LEADER' && r.status === 'ACTIVE' && r.institutionId === institutionId,
      );
      if (!isLeader) {
        throw new ForbiddenException('Você não pode ver os eventos de cuidado desta instituição');
      }
      const memberships = await this.prisma.groupMembership.findMany({
        where: { status: 'ACTIVE', group: { institutionId, leaderId: actor.id } },
        select: { missionaryId: true },
      });
      missionaryIdFilter = memberships.map((m) => m.missionaryId);
    }

    return this.prisma.careEvent.findMany({
      where: {
        institutionId,
        ...(missionaryIdFilter ? { missionaryId: { in: missionaryIdFilter } } : {}),
      },
      include: { missionary: { select: { id: true, fullName: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async closeCareEvent(careEventId: string, closingNote: string, actor: AuthenticatedUser) {
    const event = await this.prisma.careEvent.findUnique({ where: { id: careEventId } });
    if (!event) {
      throw new NotFoundException('Evento de cuidado não encontrado');
    }

    const allowed = await this.canManageMissionary(event.institutionId, event.missionaryId, actor);
    if (!allowed) {
      throw new ForbiddenException('Você não pode encerrar este evento de cuidado');
    }

    const updated = await this.prisma.careEvent.update({
      where: { id: careEventId },
      data: { status: 'CLOSED', closedAt: new Date(), closedByUserId: actor.id, closingNote },
    });

    await this.audit.log({
      actorUserId: actor.id,
      action: 'care_event.close',
      entityType: 'CareEvent',
      entityId: careEventId,
    });

    return updated;
  }

  async deleteCheckin(institutionId: string, checkinId: string, actor: AuthenticatedUser) {
    const checkin = await this.prisma.dailyCheckin.findUnique({ where: { id: checkinId } });
    if (!checkin || checkin.institutionId !== institutionId) {
      throw new NotFoundException('Check-in não encontrado');
    }

    const allowed = await this.canManageMissionary(institutionId, checkin.missionaryId, actor);
    if (!allowed) {
      throw new ForbiddenException('Você não pode apagar o check-in deste missionário');
    }

    await this.prisma.$transaction([
      // Preserva o Evento de Cuidado (e sua nota de encerramento) mesmo depois de
      // apagar o check-in que o originou — só desvincula a referência.
      this.prisma.careEvent.updateMany({ where: { checkinId }, data: { checkinId: null } }),
      this.prisma.dailyCheckin.delete({ where: { id: checkinId } }),
    ]);

    await this.audit.log({
      actorUserId: actor.id,
      action: 'checkin.delete',
      entityType: 'DailyCheckin',
      entityId: checkinId,
      metadata: { missionaryId: checkin.missionaryId, checkinDate: checkin.checkinDate },
    });

    return { success: true };
  }
}
