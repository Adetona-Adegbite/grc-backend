-- CreateTable
CREATE TABLE "test_plan_overrides" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "testerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_plan_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_plan_overrides_companyId_controlId_period_key" ON "test_plan_overrides"("companyId", "controlId", "period");

-- AddForeignKey
ALTER TABLE "test_plan_overrides" ADD CONSTRAINT "test_plan_overrides_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plan_overrides" ADD CONSTRAINT "test_plan_overrides_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "controls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_plan_overrides" ADD CONSTRAINT "test_plan_overrides_testerId_fkey" FOREIGN KEY ("testerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
