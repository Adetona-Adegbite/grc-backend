/*
  Warnings:

  - Added the required column `countryId` to the `controls` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nature` to the `controls` table without a default value. This is not possible if the table is not empty.
  - Added the required column `type` to the `controls` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Nature" AS ENUM ('manual', 'it_dependent_manual');

-- CreateEnum
CREATE TYPE "ControlType" AS ENUM ('preventive', 'detective');

-- CreateEnum
CREATE TYPE "TestResultStatus" AS ENUM ('pass', 'exception', 'fail');

-- AlterTable
ALTER TABLE "controls" ADD COLUMN     "countryId" TEXT NOT NULL,
ADD COLUMN     "nature" "Nature" NOT NULL,
ADD COLUMN     "testDueDay" INTEGER NOT NULL DEFAULT 15,
ADD COLUMN     "testerId" TEXT,
ADD COLUMN     "type" "ControlType" NOT NULL;

-- CreateTable
CREATE TABLE "test_results" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "testerId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "population" INTEGER NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "exceptions" INTEGER NOT NULL,
    "result" "TestResultStatus" NOT NULL,
    "evidenceUrl" TEXT,
    "testedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_results_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_results_companyId_controlId_period_key" ON "test_results"("companyId", "controlId", "period");

-- AddForeignKey
ALTER TABLE "controls" ADD CONSTRAINT "controls_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controls" ADD CONSTRAINT "controls_testerId_fkey" FOREIGN KEY ("testerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "controls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_testerId_fkey" FOREIGN KEY ("testerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
