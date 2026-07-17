-- CreateTable
CREATE TABLE "audits" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "areaProcess" TEXT,
    "auditName" TEXT NOT NULL,
    "objectives" TEXT,
    "scope" TEXT,
    "keyRisks" TEXT,
    "lead" TEXT,
    "procedures" TEXT,
    "startMonth" TEXT NOT NULL,
    "dueDay" INTEGER NOT NULL DEFAULT 15,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_periods" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_issues" (
    "id" TEXT NOT NULL,
    "auditIssueId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "auditPeriodId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'medium',
    "status" "IssueStatus" NOT NULL DEFAULT 'open',
    "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_issues_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "audits_companyId_auditId_key" ON "audits"("companyId", "auditId");

-- CreateIndex
CREATE UNIQUE INDEX "audits_companyId_controlId_key" ON "audits"("companyId", "controlId");

-- CreateIndex
CREATE UNIQUE INDEX "audit_periods_auditId_period_key" ON "audit_periods"("auditId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "audit_issues_companyId_auditIssueId_key" ON "audit_issues"("companyId", "auditIssueId");

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "controls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audits" ADD CONSTRAINT "audits_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_periods" ADD CONSTRAINT "audit_periods_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_periods" ADD CONSTRAINT "audit_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_auditPeriodId_fkey" FOREIGN KEY ("auditPeriodId") REFERENCES "audit_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_issues" ADD CONSTRAINT "audit_issues_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
