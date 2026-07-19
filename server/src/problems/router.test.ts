import request from "supertest";
import { createApp } from "../app";
import { prisma } from "../db/prisma";

jest.mock("../db/prisma", () => ({
  prisma: {
    problem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

// app.ts pulls in the real Redis client (via the submissions router's rate
// limiter); mock it so this test doesn't open a real network connection.
jest.mock("../db/redis", () => ({ redis: {} }));

const mockedPrisma = prisma as unknown as {
  problem: { [K in "findMany" | "findUnique"]: jest.Mock };
};

const app = createApp();

const sampleProblem = {
  id: "problem-1",
  slug: "two-sum",
  title: "Two Sum",
  description: "...",
  difficulty: "EASY",
  tags: ["arrays", "hash-map"],
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /problems", () => {
  it("lists problems with no filters", async () => {
    mockedPrisma.problem.findMany.mockResolvedValue([sampleProblem]);

    const res = await request(app).get("/problems");

    expect(res.status).toBe(200);
    expect(res.body.problems).toEqual([sampleProblem]);
    expect(mockedPrisma.problem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
  });

  it("never selects testCases (expected outputs would let users cheat)", async () => {
    mockedPrisma.problem.findMany.mockResolvedValue([sampleProblem]);

    await request(app).get("/problems");

    const { select } = mockedPrisma.problem.findMany.mock.calls[0][0];
    expect(select).toBeDefined();
    expect(select.testCases).toBeUndefined();
  });

  it("filters by difficulty", async () => {
    mockedPrisma.problem.findMany.mockResolvedValue([sampleProblem]);

    const res = await request(app).get("/problems?difficulty=EASY");

    expect(res.status).toBe(200);
    expect(mockedPrisma.problem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { difficulty: "EASY" } }),
    );
  });

  it("rejects an invalid difficulty", async () => {
    const res = await request(app).get("/problems?difficulty=NIGHTMARE");

    expect(res.status).toBe(400);
    expect(mockedPrisma.problem.findMany).not.toHaveBeenCalled();
  });

  it("filters by tags", async () => {
    mockedPrisma.problem.findMany.mockResolvedValue([sampleProblem]);

    const res = await request(app).get("/problems?tags=arrays,dp");

    expect(res.status).toBe(200);
    expect(mockedPrisma.problem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tags: { hasSome: ["arrays", "dp"] } } }),
    );
  });
});

describe("GET /problems/:slug", () => {
  it("returns a problem by slug", async () => {
    mockedPrisma.problem.findUnique.mockResolvedValue(sampleProblem);

    const res = await request(app).get("/problems/two-sum");

    expect(res.status).toBe(200);
    expect(res.body.problem).toEqual(sampleProblem);
  });

  it("404s for an unknown slug", async () => {
    mockedPrisma.problem.findUnique.mockResolvedValue(null);

    const res = await request(app).get("/problems/does-not-exist");

    expect(res.status).toBe(404);
  });

  it("never selects testCases (expected outputs would let users cheat)", async () => {
    mockedPrisma.problem.findUnique.mockResolvedValue(sampleProblem);

    await request(app).get("/problems/two-sum");

    const { select } = mockedPrisma.problem.findUnique.mock.calls[0][0];
    expect(select).toBeDefined();
    expect(select.testCases).toBeUndefined();
  });
});
