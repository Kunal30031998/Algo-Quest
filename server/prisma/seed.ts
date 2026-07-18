import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const problems = [
  {
    slug: "two-sum",
    title: "Two Sum",
    description:
      "Input: n, then n space-separated integers, then a target on its own line. " +
      "Output: the two 0-indexed positions (space-separated) of the numbers that add up to the target.",
    difficulty: "EASY" as const,
    tags: ["arrays", "hash-map"],
    testCases: [{ input: "4\n2 7 11 15\n9\n", expectedOutput: "0 1" }],
  },
  {
    slug: "reverse-linked-list",
    title: "Reverse Linked List",
    description:
      "Input: n, then n space-separated integers representing the list. " +
      "Output: the values in reverse order, space-separated.",
    difficulty: "EASY" as const,
    tags: ["linked-list"],
    testCases: [{ input: "5\n1 2 3 4 5\n", expectedOutput: "5 4 3 2 1" }],
  },
  {
    slug: "binary-search",
    title: "Binary Search",
    description:
      "Input: n, then n sorted space-separated integers, then a target on its own line. " +
      "Output: the 0-indexed position of the target, or -1 if absent.",
    difficulty: "EASY" as const,
    tags: ["binary-search", "arrays"],
    testCases: [{ input: "5\n1 3 5 7 9\n7\n", expectedOutput: "3" }],
  },
  {
    slug: "longest-substring-without-repeating-characters",
    title: "Longest Substring Without Repeating Characters",
    description:
      "Input: a single line string. Output: the length of the longest substring without repeating characters.",
    difficulty: "MEDIUM" as const,
    tags: ["strings", "sliding-window"],
    testCases: [{ input: "abcabcbb\n", expectedOutput: "3" }],
  },
  {
    slug: "merge-intervals",
    title: "Merge Intervals",
    description:
      "Input: n, then n lines each with two space-separated integers (an interval). " +
      "Output: the merged, sorted intervals, one per line.",
    difficulty: "MEDIUM" as const,
    tags: ["arrays", "sorting"],
    testCases: [
      { input: "4\n1 3\n2 6\n8 10\n15 18\n", expectedOutput: "1 6\n8 10\n15 18" },
    ],
  },
  {
    slug: "word-ladder",
    title: "Word Ladder",
    description:
      "Input: the begin word, the end word, then n, then n space-separated dictionary words. " +
      "Output: the length of the shortest transformation sequence, or 0 if none exists.",
    difficulty: "HARD" as const,
    tags: ["graphs", "bfs"],
    testCases: [
      { input: "hit\ncog\n6\nhot dot dog lot log cog\n", expectedOutput: "5" },
    ],
  },
];

async function main() {
  for (const problem of problems) {
    await prisma.problem.upsert({
      where: { slug: problem.slug },
      update: problem,
      create: problem,
    });
  }
  console.log(`Seeded ${problems.length} problems.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
