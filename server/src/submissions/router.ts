import { Router } from "express";
import { prisma } from "../db/prisma";
import { requireAuth } from "../auth/middleware";
import { Judge0UnavailableError, runSubmission } from "../judge0/client";
import { mapJudge0Status } from "../judge0/status";
import { LANGUAGE_IDS, isSupportedLanguage } from "../judge0/languages";
import { parseTestCases } from "../problems/testCase";

export const submissionsRouter = Router();

const MAX_CODE_LENGTH = 65_536;
const MAX_STORED_OUTPUT_LENGTH = 8_192;

function truncate(value: string | null, maxLength: number): string | null {
  if (!value) return value;
  return value.length > maxLength ? `${value.slice(0, maxLength)}\n...(truncated)` : value;
}

submissionsRouter.post("/", requireAuth, async (req, res) => {
  const { problemId, code, language } = req.body ?? {};

  if (
    typeof problemId !== "string" ||
    typeof code !== "string" ||
    code.length === 0 ||
    code.length > MAX_CODE_LENGTH ||
    !isSupportedLanguage(language)
  ) {
    res.status(400).json({ error: "Invalid problemId, code, or language" });
    return;
  }

  const problem = await prisma.problem.findUnique({ where: { id: problemId } });
  if (!problem) {
    res.status(404).json({ error: "Problem not found" });
    return;
  }

  const submission = await prisma.submission.create({
    data: {
      userId: req.userId!,
      problemId,
      code,
      language,
      status: "PENDING",
    },
  });

  const testCases = parseTestCases(problem.testCases);
  const languageId = LANGUAGE_IDS[language];

  try {
    let finalStatus: ReturnType<typeof mapJudge0Status> = "ACCEPTED";
    let output: string | null = null;

    // Fail fast: stop at the first test case that doesn't pass, matching
    // typical judge behavior (no point running the rest).
    for (const testCase of testCases.length > 0 ? testCases : [null]) {
      const result = await runSubmission({
        sourceCode: code,
        languageId,
        stdin: testCase?.input,
        expectedOutput: testCase?.expectedOutput,
      });

      finalStatus = mapJudge0Status(result);
      output = result.stderr || result.compileOutput || result.stdout || result.message;

      if (finalStatus !== "ACCEPTED") break;
    }

    const updated = await prisma.submission.update({
      where: { id: submission.id },
      data: { status: finalStatus, output: truncate(output, MAX_STORED_OUTPUT_LENGTH) },
    });

    res.status(201).json({ submission: updated });
  } catch (error) {
    const message = error instanceof Judge0UnavailableError ? error.message : "Judging failed";
    await prisma.submission.update({
      where: { id: submission.id },
      data: { status: "INTERNAL_ERROR", output: message },
    });
    res.status(502).json({ error: "Judging is temporarily unavailable" });
  }
});

submissionsRouter.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  if (typeof id !== "string") {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  const submission = await prisma.submission.findUnique({ where: { id } });

  // Same 404 whether it doesn't exist or belongs to someone else — don't
  // leak which one it is.
  if (!submission || submission.userId !== req.userId) {
    res.status(404).json({ error: "Submission not found" });
    return;
  }

  res.status(200).json({ submission });
});
