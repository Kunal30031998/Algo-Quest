process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../app";
import { prisma } from "../db/prisma";
import { runSubmission, Judge0UnavailableError } from "../judge0/client";

jest.mock("../db/prisma", () => ({
  prisma: {
    problem: { findUnique: jest.fn() },
    submission: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
  },
}));

jest.mock("../judge0/client", () => {
  const actual = jest.requireActual("../judge0/client");
  return {
    ...actual,
    runSubmission: jest.fn(),
  };
});

// Rate limiting has its own dedicated test file — bypass it here so these
// tests don't depend on a real Redis connection.
jest.mock("../rateLimit/submissionRateLimit", () => ({
  submissionRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock("../rateLimit/authRateLimit", () => ({
  registerRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
  loginRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockedPrisma = prisma as unknown as {
  problem: { findUnique: jest.Mock };
  submission: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
};
const mockedRunSubmission = runSubmission as jest.Mock;

const app = createApp();
const userId = "user-1";
const token = () => jwt.sign({ sub: userId }, process.env.JWT_ACCESS_SECRET!, { expiresIn: "15m" });

const sampleProblem = {
  id: "problem-1",
  slug: "two-sum",
  testCases: [{ input: "1 2\n", expectedOutput: "3" }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedPrisma.submission.create.mockResolvedValue({ id: "sub-1", userId, status: "PENDING" });
});

describe("POST /submissions", () => {
  it("stores ACCEPTED when the test case passes", async () => {
    mockedPrisma.problem.findUnique.mockResolvedValue(sampleProblem);
    mockedRunSubmission.mockResolvedValue({
      statusId: 3,
      statusDescription: "Accepted",
      stdout: "3",
      stderr: null,
      compileOutput: null,
      message: null,
      time: "0.02",
      memory: 3000,
    });
    mockedPrisma.submission.update.mockResolvedValue({ id: "sub-1", status: "ACCEPTED" });

    const res = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${token()}`)
      .send({ problemId: "problem-1", code: "print(3)", language: "python" });

    expect(res.status).toBe(201);
    expect(mockedPrisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACCEPTED" }) }),
    );
  });

  it("stores WRONG_ANSWER when the test case fails", async () => {
    mockedPrisma.problem.findUnique.mockResolvedValue(sampleProblem);
    mockedRunSubmission.mockResolvedValue({
      statusId: 4,
      statusDescription: "Wrong Answer",
      stdout: "4",
      stderr: null,
      compileOutput: null,
      message: null,
      time: "0.02",
      memory: 3000,
    });
    mockedPrisma.submission.update.mockResolvedValue({ id: "sub-1", status: "WRONG_ANSWER" });

    const res = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${token()}`)
      .send({ problemId: "problem-1", code: "print(4)", language: "python" });

    expect(res.status).toBe(201);
    expect(mockedPrisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "WRONG_ANSWER" }) }),
    );
  });

  it("maps a runtime error at the memory limit to MEMORY_LIMIT_EXCEEDED", async () => {
    mockedPrisma.problem.findUnique.mockResolvedValue(sampleProblem);
    mockedRunSubmission.mockResolvedValue({
      statusId: 11,
      statusDescription: "Runtime Error (NZEC)",
      stdout: null,
      stderr: "Killed",
      compileOutput: null,
      message: null,
      time: "0.2",
      memory: 128000,
    });
    mockedPrisma.submission.update.mockResolvedValue({ id: "sub-1", status: "MEMORY_LIMIT_EXCEEDED" });

    const res = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${token()}`)
      .send({ problemId: "problem-1", code: "bomb()", language: "python" });

    expect(res.status).toBe(201);
    expect(mockedPrisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "MEMORY_LIMIT_EXCEEDED" }) }),
    );
  });

  it("rejects an unsupported language", async () => {
    const res = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${token()}`)
      .send({ problemId: "problem-1", code: "print(1)", language: "brainfuck" });

    expect(res.status).toBe(400);
    expect(mockedPrisma.submission.create).not.toHaveBeenCalled();
  });

  it("404s for an unknown problem", async () => {
    mockedPrisma.problem.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${token()}`)
      .send({ problemId: "does-not-exist", code: "print(1)", language: "python" });

    expect(res.status).toBe(404);
    expect(mockedPrisma.submission.create).not.toHaveBeenCalled();
  });

  it("rejects when unauthenticated", async () => {
    const res = await request(app)
      .post("/submissions")
      .send({ problemId: "problem-1", code: "print(1)", language: "python" });

    expect(res.status).toBe(401);
  });

  it("marks the submission INTERNAL_ERROR and returns 502 when Judge0 is unreachable", async () => {
    mockedPrisma.problem.findUnique.mockResolvedValue(sampleProblem);
    mockedRunSubmission.mockRejectedValue(new Judge0UnavailableError(new Error("ECONNREFUSED")));
    mockedPrisma.submission.update.mockResolvedValue({ id: "sub-1", status: "INTERNAL_ERROR" });

    const res = await request(app)
      .post("/submissions")
      .set("Authorization", `Bearer ${token()}`)
      .send({ problemId: "problem-1", code: "print(1)", language: "python" });

    expect(res.status).toBe(502);
    expect(mockedPrisma.submission.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "INTERNAL_ERROR" }) }),
    );
  });
});

describe("GET /submissions/:id", () => {
  it("returns the submission for its owner", async () => {
    mockedPrisma.submission.findUnique.mockResolvedValue({ id: "sub-1", userId, status: "ACCEPTED" });

    const res = await request(app).get("/submissions/sub-1").set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(200);
    expect(res.body.submission.id).toBe("sub-1");
  });

  it("404s for another user's submission", async () => {
    mockedPrisma.submission.findUnique.mockResolvedValue({ id: "sub-1", userId: "someone-else", status: "ACCEPTED" });

    const res = await request(app).get("/submissions/sub-1").set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(404);
  });

  it("404s for an unknown submission", async () => {
    mockedPrisma.submission.findUnique.mockResolvedValue(null);

    const res = await request(app).get("/submissions/does-not-exist").set("Authorization", `Bearer ${token()}`);

    expect(res.status).toBe(404);
  });
});
