/*
  Warnings:

  - A unique constraint covering the columns `[companyId,controlId,countryId]` on the table `controls` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "controls_companyId_controlId_key";

-- CreateIndex
CREATE UNIQUE INDEX "controls_companyId_controlId_countryId_key" ON "controls"("companyId", "controlId", "countryId");
