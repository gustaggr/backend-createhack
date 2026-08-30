-- CreateEnum
CREATE TYPE "QuestionDimension" AS ENUM ('PHYSICAL', 'EMOTIONAL', 'SPIRITUAL', 'MINISTRY', 'RELATIONAL');

-- CreateEnum
CREATE TYPE "ScoreBand" AS ENUM ('STABLE', 'ATTENTION', 'PRIORITY');

-- CreateEnum
CREATE TYPE "CheckinStatus" AS ENUM ('PENDING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "CareEventSeverity" AS ENUM ('ATTENTION', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CareEventStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "set_number" INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    "dimension" "QuestionDimension" NOT NULL,
    "text" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "is_red_flag" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_checkins" (
    "id" TEXT NOT NULL,
    "missionary_id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "checkin_date" DATE NOT NULL,
    "set_number" INTEGER NOT NULL,
    "status" "CheckinStatus" NOT NULL DEFAULT 'PENDING',
    "overall_score" DOUBLE PRECISION,
    "overall_band" "ScoreBand",
    "has_critical_alert" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_answers" (
    "id" TEXT NOT NULL,
    "checkin_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "selected_option" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkin_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dimension_scores" (
    "id" TEXT NOT NULL,
    "checkin_id" TEXT NOT NULL,
    "dimension" "QuestionDimension" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "band" "ScoreBand" NOT NULL,

    CONSTRAINT "dimension_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_events" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "missionary_id" TEXT NOT NULL,
    "checkin_id" TEXT,
    "reason" TEXT NOT NULL,
    "severity" "CareEventSeverity" NOT NULL,
    "status" "CareEventStatus" NOT NULL DEFAULT 'OPEN',
    "closed_at" TIMESTAMP(3),
    "closed_by_user_id" TEXT,
    "closing_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "care_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "questions_set_number_order_key" ON "questions"("set_number", "order");

-- CreateIndex
CREATE UNIQUE INDEX "daily_checkins_missionary_id_checkin_date_key" ON "daily_checkins"("missionary_id", "checkin_date");

-- CreateIndex
CREATE UNIQUE INDEX "checkin_answers_checkin_id_question_id_key" ON "checkin_answers"("checkin_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "dimension_scores_checkin_id_dimension_key" ON "dimension_scores"("checkin_id", "dimension");

-- AddForeignKey
ALTER TABLE "daily_checkins" ADD CONSTRAINT "daily_checkins_missionary_id_fkey" FOREIGN KEY ("missionary_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_checkins" ADD CONSTRAINT "daily_checkins_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_answers" ADD CONSTRAINT "checkin_answers_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "daily_checkins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_answers" ADD CONSTRAINT "checkin_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dimension_scores" ADD CONSTRAINT "dimension_scores_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "daily_checkins"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_missionary_id_fkey" FOREIGN KEY ("missionary_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_checkin_id_fkey" FOREIGN KEY ("checkin_id") REFERENCES "daily_checkins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_events" ADD CONSTRAINT "care_events_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
