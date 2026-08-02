-- AlterTable
ALTER TABLE "document_requests" ADD COLUMN     "auditId" TEXT;

-- AddForeignKey
ALTER TABLE "document_requests" ADD CONSTRAINT "document_requests_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE SET NULL ON UPDATE CASCADE;
