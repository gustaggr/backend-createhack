/*
  Warnings:

  - You are about to drop the `invite_webhook_endpoints` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "invite_webhook_endpoints" DROP CONSTRAINT "invite_webhook_endpoints_institution_id_fkey";

-- DropTable
DROP TABLE "invite_webhook_endpoints";

-- CreateTable
CREATE TABLE "webhook_config" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "webhook_config_pkey" PRIMARY KEY ("id")
);
