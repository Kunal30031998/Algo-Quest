import type { NextFunction, Request, Response } from "express";
import { redis } from "../db/redis";
import { submissionRateLimit } from "./submissionRateLimit";

jest.mock("../db/redis", () => ({
  redis: {
    incr: jest.fn(),
    expire: jest.fn(),
    ttl: jest.fn(),
  },
}));

const mockedRedis = redis as unknown as {
  incr: jest.Mock;
  expire: jest.Mock;
  ttl: jest.Mock;
};

function mockRes() {
  const res: Partial<Response> = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
  };
  return res as Response;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("submissionRateLimit", () => {
  it("allows the request and sets expiry on the first submission in a window", async () => {
    mockedRedis.incr.mockResolvedValue(1);
    const req = { userId: "user-1" } as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await submissionRateLimit(req, res, next);

    expect(mockedRedis.expire).toHaveBeenCalledWith("ratelimit:submissions:user-1", 60);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("does not re-set expiry on subsequent submissions in the same window", async () => {
    mockedRedis.incr.mockResolvedValue(5);
    const req = { userId: "user-1" } as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await submissionRateLimit(req, res, next);

    expect(mockedRedis.expire).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
  });

  it("isolates counters per user", async () => {
    mockedRedis.incr.mockResolvedValue(1);
    const next = jest.fn() as NextFunction;

    await submissionRateLimit({ userId: "user-a" } as Request, mockRes(), next);
    await submissionRateLimit({ userId: "user-b" } as Request, mockRes(), next);

    expect(mockedRedis.incr).toHaveBeenCalledWith("ratelimit:submissions:user-a");
    expect(mockedRedis.incr).toHaveBeenCalledWith("ratelimit:submissions:user-b");
  });

  it("rejects with 429 and Retry-After once the limit is exceeded", async () => {
    mockedRedis.incr.mockResolvedValue(21);
    mockedRedis.ttl.mockResolvedValue(37);
    const req = { userId: "user-1" } as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await submissionRateLimit(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", "37");
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed (503) when Redis is unreachable", async () => {
    mockedRedis.incr.mockRejectedValue(new Error("ECONNREFUSED"));
    const req = { userId: "user-1" } as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await submissionRateLimit(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });
});
