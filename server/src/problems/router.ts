import { Router } from "express";
import { prisma } from "../db/prisma";
import { Prisma } from "../generated/prisma/client";

export const problemsRouter = Router();

const VALID_DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
type Difficulty = (typeof VALID_DIFFICULTIES)[number];

function isDifficulty(value: unknown): value is Difficulty {
  return typeof value === "string" && (VALID_DIFFICULTIES as readonly string[]).includes(value);
}

problemsRouter.get("/", async (req, res) => {
  const { difficulty, tags } = req.query;

  if (difficulty !== undefined && !isDifficulty(difficulty)) {
    res.status(400).json({ error: "difficulty must be one of EASY, MEDIUM, HARD" });
    return;
  }

  const where: Prisma.ProblemWhereInput = {};
  if (difficulty !== undefined) {
    where.difficulty = difficulty;
  }
  if (typeof tags === "string" && tags.length > 0) {
    where.tags = { hasSome: tags.split(",").map((tag) => tag.trim()).filter(Boolean) };
  }

  const problems = await prisma.problem.findMany({ where, orderBy: { createdAt: "asc" } });
  res.status(200).json({ problems });
});

problemsRouter.get("/:slug", async (req, res) => {
  const problem = await prisma.problem.findUnique({ where: { slug: req.params.slug } });

  if (!problem) {
    res.status(404).json({ error: "Problem not found" });
    return;
  }

  res.status(200).json({ problem });
});
