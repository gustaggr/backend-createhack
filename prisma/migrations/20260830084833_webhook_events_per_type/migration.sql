-- CreateEnum
CREATE TYPE "WebhookEvent" AS ENUM ('INVITE_CREATED', 'SCORE_ALERT');

-- AlterTable: add the column with a temporary default so the existing row
-- (previously the single invite webhook) becomes the INVITE_CREATED config,
-- then drop the default since new rows must always specify the event.
ALTER TABLE "webhook_config" ADD COLUMN "event" "WebhookEvent" NOT NULL DEFAULT 'INVITE_CREATED';
ALTER TABLE "webhook_config" ALTER COLUMN "event" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX "webhook_config_event_key" ON "webhook_config"("event");
