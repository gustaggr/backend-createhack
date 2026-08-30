/*
  Warnings:

  - You are about to drop the column `leader_id` on the `invites` table. All the data in the column will be lost.
  - You are about to drop the `leadership_links` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "GroupStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "GroupMembershipStatus" AS ENUM ('ACTIVE', 'ENDED');

-- DropForeignKey
ALTER TABLE "invites" DROP CONSTRAINT "invites_leader_id_fkey";

-- DropForeignKey
ALTER TABLE "leadership_links" DROP CONSTRAINT "leadership_links_changed_by_user_id_fkey";

-- DropForeignKey
ALTER TABLE "leadership_links" DROP CONSTRAINT "leadership_links_institution_id_fkey";

-- DropForeignKey
ALTER TABLE "leadership_links" DROP CONSTRAINT "leadership_links_leader_id_fkey";

-- DropForeignKey
ALTER TABLE "leadership_links" DROP CONSTRAINT "leadership_links_missionary_id_fkey";

-- AlterTable
ALTER TABLE "invites" DROP COLUMN "leader_id",
ADD COLUMN     "group_id" TEXT;

-- DropTable
DROP TABLE "leadership_links";

-- DropEnum
DROP TYPE "LeadershipLinkStatus";

-- CreateTable
CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "institution_id" TEXT NOT NULL,
    "leader_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "locality" TEXT,
    "status" "GroupStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "missionary_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),
    "status" "GroupMembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "changed_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_institution_id_fkey" FOREIGN KEY ("institution_id") REFERENCES "institutions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_missionary_id_fkey" FOREIGN KEY ("missionary_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
