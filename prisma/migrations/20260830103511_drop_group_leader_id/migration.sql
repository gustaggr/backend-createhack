-- DropForeignKey
ALTER TABLE "groups" DROP CONSTRAINT "groups_leader_id_fkey";

-- AlterTable
ALTER TABLE "groups" DROP COLUMN "leader_id";
