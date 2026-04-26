-- CreateEnum
CREATE TYPE "Frequency" AS ENUM ('monthly', 'quarterly', 'annual', 'as_needed');

-- CreateEnum
CREATE TYPE "ControlStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controls" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "controlId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "frequency" "Frequency" NOT NULL,
    "ownerId" TEXT,
    "status" "ControlStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "controls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "countries_companyId_code_key" ON "countries"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "controls_companyId_controlId_key" ON "controls"("companyId", "controlId");

-- AddForeignKey
ALTER TABLE "countries" ADD CONSTRAINT "countries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controls" ADD CONSTRAINT "controls_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "controls" ADD CONSTRAINT "controls_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
