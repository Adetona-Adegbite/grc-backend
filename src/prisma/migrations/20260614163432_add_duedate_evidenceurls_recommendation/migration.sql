-- AlterTable
ALTER TABLE "controls" ADD COLUMN     "testDueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "test_results" ADD COLUMN     "evidenceUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "recommendation" TEXT;
