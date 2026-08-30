-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_leader_id_fkey" FOREIGN KEY ("leader_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
