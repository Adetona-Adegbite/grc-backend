-- AlterTable
ALTER TABLE "audits" ADD COLUMN     "recipientId" TEXT;

-- CreateTable
CREATE TABLE "audit_comments" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "period" TEXT,
    "isRequest" BOOLEAN NOT NULL DEFAULT false,
    "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_comments_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_comments" ADD CONSTRAINT "audit_comments_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_comments" ADD CONSTRAINT "audit_comments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_comments" ADD CONSTRAINT "audit_comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
