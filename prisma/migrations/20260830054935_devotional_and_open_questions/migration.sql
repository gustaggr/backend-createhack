-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('SCORED_CHOICE', 'UNSCORED_CHOICE', 'OPEN_TEXT');

-- AlterTable
ALTER TABLE "checkin_answers" ADD COLUMN     "text_answer" TEXT,
ALTER COLUMN "selected_option" DROP NOT NULL,
ALTER COLUMN "points" DROP NOT NULL;

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "depends_on_order" INTEGER,
ADD COLUMN     "skip_when_option" TEXT,
ADD COLUMN     "type" "QuestionType" NOT NULL DEFAULT 'SCORED_CHOICE',
ALTER COLUMN "dimension" DROP NOT NULL,
ALTER COLUMN "options" DROP NOT NULL;
