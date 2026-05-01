/*
  Warnings:

  - The values [it_dependent_manual] on the enum `Nature` will be removed. If these variants are still used in the database, this will fail.
  - Added the required column `description` to the `controls` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "ControlType" ADD VALUE 'corrective';

-- AlterEnum
BEGIN;
CREATE TYPE "Nature_new" AS ENUM ('manual', 'automated');
ALTER TABLE "controls" ALTER COLUMN "nature" TYPE "Nature_new" USING ("nature"::text::"Nature_new");
ALTER TYPE "Nature" RENAME TO "Nature_old";
ALTER TYPE "Nature_new" RENAME TO "Nature";
DROP TYPE "Nature_old";
COMMIT;

-- AlterTable
ALTER TABLE "controls" ADD COLUMN     "description" TEXT NOT NULL;
