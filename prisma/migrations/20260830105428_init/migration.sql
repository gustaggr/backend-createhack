-- DropForeignKey
ALTER TABLE "materials" DROP CONSTRAINT "materials_leader_id_fkey";

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
