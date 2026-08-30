import { Prisma, PrismaClient, type QuestionDimension, type QuestionType } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

interface SeedOption {
  label: 'A' | 'B' | 'C' | 'D';
  text: string;
  points?: 0 | 1 | 2 | 3;
}

interface SeedQuestion {
  order: number;
  type?: QuestionType;
  dimension?: QuestionDimension;
  text: string;
  isRedFlag?: boolean;
  options?: SeedOption[];
  dependsOnOrder?: number;
  skipWhenOption?: string;
}

// Conjunto 1 do quest diário — as próximas remessas de perguntas entram aqui
// como novos setNumber, sem precisar mudar código (ver checkins.util.ts).
const SET_1_QUESTIONS: SeedQuestion[] = [
  {
    order: 1,
    dimension: 'PHYSICAL',
    text: 'Como foi a sua rotina de sono e descanso nas últimas semanas?',
    options: [
      { label: 'A', text: 'Dormi muito bem e acordo revigorado.', points: 0 },
      { label: 'B', text: 'Tive um pouco de dificuldade em pegar no sono alguns dias.', points: 1 },
      { label: 'C', text: 'Tenho acordado no meio da noite na maioria dos dias.', points: 2 },
      { label: 'D', text: 'Não consigo dormir direito quase todos os dias.', points: 3 },
    ],
  },
  {
    order: 2,
    dimension: 'PHYSICAL',
    text: 'Como você tem se sentido em relação à sua energia física para as demandas do campo?',
    options: [
      { label: 'A', text: 'Tenho bastante energia e disposição.', points: 0 },
      { label: 'B', text: 'Sinto um cansaço leve, mas dou conta do recado.', points: 1 },
      { label: 'C', text: 'Me sinto esgotado na maior parte da semana.', points: 2 },
      { label: 'D', text: 'Sinto que não tenho energia para fazer quase nada.', points: 3 },
    ],
  },
  {
    order: 3,
    dimension: 'EMOTIONAL',
    text: 'Em relação às preocupações diárias e ao estresse, como você tem lidado?',
    options: [
      { label: 'A', text: 'Estou em paz e consigo entregar minhas ansiedades a Deus.', points: 0 },
      { label: 'B', text: 'Tenho me preocupado com algumas coisas, mas consigo controlar.', points: 1 },
      { label: 'C', text: 'Tenho tido muita dificuldade para relaxar mais da metade dos dias.', points: 2 },
      { label: 'D', text: 'Sinto que algo terrível vai acontecer quase todos os dias.', points: 3 },
    ],
  },
  {
    order: 4,
    dimension: 'MINISTRY',
    text: 'Como está sua motivação para realizar as atividades do ministério e da vida diária?',
    options: [
      { label: 'A', text: 'Faço tudo com muita alegria e propósito.', points: 0 },
      { label: 'B', text: 'Perdi um pouco do prazer, mas continuo fazendo.', points: 1 },
      { label: 'C', text: 'Tenho que me forçar muito, pois perdi o interesse na maioria das coisas.', points: 2 },
      { label: 'D', text: 'Não sinto prazer ou interesse em mais nada ultimamente.', points: 3 },
    ],
  },
  {
    order: 5,
    dimension: 'SPIRITUAL',
    text: 'Como tem sido o seu tempo de intimidade e oração com o Senhor?',
    options: [
      { label: 'A', text: 'Tenho tido tempos preciosos e me sinto próximo de Deus.', points: 0 },
      { label: 'B', text: 'Às vezes me distraio, mas mantenho minha rotina de oração.', points: 1 },
      { label: 'C', text: 'Tenho sentido uma secura espiritual e oro pouco ultimamente.', points: 2 },
      { label: 'D', text: 'Sinto que Deus está muito distante e não consigo orar de jeito nenhum.', points: 3 },
    ],
  },
  {
    order: 6,
    dimension: 'RELATIONAL',
    text: 'Sobre o seu sentimento de pertencimento e apoio no campo, como você se avalia?',
    options: [
      { label: 'A', text: 'Me sinto muito amado e bem amparado pela minha equipe e liderança.', points: 0 },
      { label: 'B', text: 'Sinto um pouco de falta de casa, mas converso com os irmãos.', points: 1 },
      { label: 'C', text: 'Tenho me sentido muito sozinho na maior parte do tempo.', points: 2 },
      { label: 'D', text: 'Sinto que ninguém me entende ou se importa comigo aqui.', points: 3 },
    ],
  },
  {
    order: 7,
    dimension: 'PHYSICAL',
    text: 'Como tem estado o seu apetite e alimentação nos últimos dias?',
    options: [
      { label: 'A', text: 'Minha alimentação está normal e equilibrada.', points: 0 },
      { label: 'B', text: 'Pulei algumas refeições, mas nada grave.', points: 1 },
      { label: 'C', text: 'Tenho comido muito pouco ou de forma compulsiva quase todo dia.', points: 2 },
      { label: 'D', text: 'Perdi totalmente o apetite ou não consigo parar de comer.', points: 3 },
    ],
  },
  {
    order: 8,
    dimension: 'EMOTIONAL',
    text: 'Você tem se sentido facilmente irritado ou aborrecido com as pessoas ao seu redor?',
    options: [
      { label: 'A', text: 'Tenho sido paciente e compreensivo com os irmãos.', points: 0 },
      { label: 'B', text: 'Às vezes perco a paciência, mas peço perdão logo.', points: 1 },
      { label: 'C', text: 'Tenho me irritado com facilidade mais da metade dos dias.', points: 2 },
      { label: 'D', text: 'Qualquer pequena coisa me tira do sério quase todos os dias.', points: 3 },
    ],
  },
  {
    order: 9,
    dimension: 'SPIRITUAL',
    text: 'Como você enxerga a si mesmo e o seu valor no ministério hoje?',
    options: [
      { label: 'A', text: 'Sei que sou amado por Deus e útil na obra dEle.', points: 0 },
      { label: 'B', text: 'Às vezes duvido da minha capacidade, mas sigo em frente.', points: 1 },
      { label: 'C', text: 'Sinto que estou falhando e decepcionando a Deus frequentemente.', points: 2 },
      { label: 'D', text: 'Sinto que sou um peso para a equipe e um fracasso total.', points: 3 },
    ],
  },
  {
    order: 10,
    dimension: 'EMOTIONAL',
    isRedFlag: true,
    text:
      'Nas últimas semanas, você teve pensamentos sobre ferir a si mesmo ou de que seria melhor não estar vivo?',
    options: [
      { label: 'A', text: 'Nenhuma vez, graças a Deus.', points: 0 },
      { label: 'B', text: 'Esse pensamento passou rápido pela mente, mas rejeitei em Cristo.', points: 1 },
      { label: 'C', text: 'Tenho pensado nisso em vários dias recentes.', points: 2 },
      { label: 'D', text: 'Tenho pensado nisso quase todos os dias.', points: 3 },
    ],
  },
  {
    order: 11,
    type: 'UNSCORED_CHOICE',
    text: 'Quanto tempo você dedicou ao seu devocional pessoal hoje?',
    options: [
      { label: 'A', text: 'Não fiz devocional hoje' },
      { label: 'B', text: '5 a 15 minutos' },
      { label: 'C', text: '15 a 30 minutos' },
      { label: 'D', text: 'Mais de 30 minutos' },
    ],
  },
  {
    order: 12,
    type: 'UNSCORED_CHOICE',
    dependsOnOrder: 11,
    skipWhenOption: 'A',
    text: 'Como foi o seu tempo de devocional hoje?',
    options: [
      { label: 'A', text: 'Fraco, só cumpri a tabela' },
      { label: 'B', text: 'Bom' },
      { label: 'C', text: 'Muito bom' },
      { label: 'D', text: 'Extraordinário, Deus falou comigo' },
    ],
  },
  {
    order: 13,
    type: 'OPEN_TEXT',
    text: 'Nos conte algo relevante que aconteceu no seu dia, que seja importante sabermos.',
  },
];

async function main() {
  const superAdminEmail = 'admin@with.app';
  const superAdminPassword = 'ChangeMe123!';

  const superAdmin = await prisma.user.upsert({
    where: { email: superAdminEmail },
    create: {
      email: superAdminEmail,
      fullName: 'Super Admin With',
      passwordHash: await bcrypt.hash(superAdminPassword, 10),
    },
    update: {},
  });

  const existingSuperAdminRole = await prisma.userRole.findFirst({
    where: { userId: superAdmin.id, institutionId: null, role: 'SUPER_ADMIN' },
  });
  if (!existingSuperAdminRole) {
    await prisma.userRole.create({
      data: { userId: superAdmin.id, institutionId: null, role: 'SUPER_ADMIN', status: 'ACTIVE' },
    });
  }

  const institution = await prisma.institution.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Instituição Demo',
      displayName: 'Missão Demo',
      country: 'BR',
      defaultLanguage: 'pt-BR',
      timezone: 'America/Sao_Paulo',
      email: 'contato@missaodemo.org',
      status: 'ACTIVE',
    },
    update: {},
  });

  const existingWebhookConfig = await prisma.webhookConfig.findUnique({
    where: { event: 'INVITE_CREATED' },
  });
  if (!existingWebhookConfig) {
    await prisma.webhookConfig.create({
      data: {
        event: 'INVITE_CREATED',
        url: 'https://webhook.site/replace-me',
        secret: randomBytes(32).toString('hex'),
        active: true,
      },
    });
  }

  for (const question of SET_1_QUESTIONS) {
    const options = question.options
      ? (question.options as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    await prisma.question.upsert({
      where: { setNumber_order: { setNumber: 1, order: question.order } },
      create: {
        setNumber: 1,
        order: question.order,
        type: question.type ?? 'SCORED_CHOICE',
        dimension: question.dimension,
        text: question.text,
        isRedFlag: question.isRedFlag ?? false,
        options,
        dependsOnOrder: question.dependsOnOrder,
        skipWhenOption: question.skipWhenOption,
      },
      update: {
        type: question.type ?? 'SCORED_CHOICE',
        dimension: question.dimension,
        text: question.text,
        isRedFlag: question.isRedFlag ?? false,
        options,
        dependsOnOrder: question.dependsOnOrder ?? null,
        skipWhenOption: question.skipWhenOption ?? null,
      },
    });
  }

  console.log('Seed concluído.');
  console.log(`SUPER_ADMIN: ${superAdminEmail} / ${superAdminPassword}`);
  console.log(`Instituição demo: ${institution.id} (${institution.displayName})`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
