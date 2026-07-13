import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const problems = [
  {
    slug: "two-sum",
    title: "Two Sum",
    description:
      "Given an array of integers and a target, return the indices of the two numbers that add up to the target.",
    difficulty: "EASY" as const,
    tags: ["arrays", "hash-map"],
  },
  {
    slug: "reverse-linked-list",
    title: "Reverse Linked List",
    description: "Reverse a singly linked list and return the new head.",
    difficulty: "EASY" as const,
    tags: ["linked-list"],
  },
  {
    slug: "binary-search",
    title: "Binary Search",
    description: "Given a sorted array and a target, return the index of the target or -1.",
    difficulty: "EASY" as const,
    tags: ["binary-search", "arrays"],
  },
  {
    slug: "longest-substring-without-repeating-characters",
    title: "Longest Substring Without Repeating Characters",
    description: "Given a string, find the length of the longest substring without repeating characters.",
    difficulty: "MEDIUM" as const,
    tags: ["strings", "sliding-window"],
  },
  {
    slug: "merge-intervals",
    title: "Merge Intervals",
    description: "Given a collection of intervals, merge all overlapping intervals.",
    difficulty: "MEDIUM" as const,
    tags: ["arrays", "sorting"],
  },
  {
    slug: "word-ladder",
    title: "Word Ladder",
    description:
      "Given two words and a dictionary, find the length of the shortest transformation sequence between them.",
    difficulty: "HARD" as const,
    tags: ["graphs", "bfs"],
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
