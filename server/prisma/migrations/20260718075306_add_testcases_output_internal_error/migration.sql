-- AlterEnum
ALTER TYPE "SubmissionStatus" ADD VALUE 'INTERNAL_ERROR';

-- AlterTable
ALTER TABLE "Problem" ADD COLUMN     "testCases" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "output" TEXT;
