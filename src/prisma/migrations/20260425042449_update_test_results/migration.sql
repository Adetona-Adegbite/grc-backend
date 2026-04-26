/*
  Warnings:

  - A unique constraint covering the columns `[companyId,testId]` on the table `test_results` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `testId` to the `test_results` table without a default value. This is not possible if the table is not empty.
  - Added the required column `testName` to the `test_results` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "test_results" ADD COLUMN     "comments" TEXT,
ADD COLUMN     "testId" TEXT NOT NULL,
ADD COLUMN     "testName" TEXT NOT NULL,
ADD COLUMN     "testProcedure" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "test_results_companyId_testId_key" ON "test_results"("companyId", "testId");
