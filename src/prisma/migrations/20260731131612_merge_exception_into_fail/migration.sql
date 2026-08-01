-- "Exception" is merged into "fail": the business treats an exception as a
-- failure, and offering both led to inconsistent recording.
--
-- Existing rows MUST be converted before the enum is narrowed, otherwise the
-- type cast below fails on any remaining 'exception' value.
UPDATE "test_results" SET "result" = 'fail' WHERE "result" = 'exception';

-- Narrow the enum to pass | fail.
ALTER TYPE "TestResultStatus" RENAME TO "TestResultStatus_old";
CREATE TYPE "TestResultStatus" AS ENUM ('pass', 'fail');
ALTER TABLE "test_results"
  ALTER COLUMN "result" TYPE "TestResultStatus"
  USING ("result"::text::"TestResultStatus");
DROP TYPE "TestResultStatus_old";
