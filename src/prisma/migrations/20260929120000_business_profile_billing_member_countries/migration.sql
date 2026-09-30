-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('unpaid', 'pending', 'active');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "address" TEXT,
ADD COLUMN     "billingCycle" TEXT,
ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "country" TEXT,
ADD COLUMN     "currency" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "subscriptionActivatedAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionPlan" TEXT,
ADD COLUMN     "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'unpaid';

-- AlterTable
ALTER TABLE "invites" ADD COLUMN     "countryIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "member_countries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_countries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "member_countries_userId_countryId_key" ON "member_countries"("userId", "countryId");

-- AddForeignKey
ALTER TABLE "member_countries" ADD CONSTRAINT "member_countries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_countries" ADD CONSTRAINT "member_countries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_countries" ADD CONSTRAINT "member_countries_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Companies that existed before billing was introduced are already customers:
-- keep them working instead of locking them behind the billing screen.
UPDATE "companies" SET "subscriptionStatus" = 'active', "subscriptionActivatedAt" = CURRENT_TIMESTAMP;
