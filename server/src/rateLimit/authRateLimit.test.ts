import type { NextFunction, Request, Response } from "express";
import { redis } from "../db/redis";
import { loginRateLimit, registerRateLimit } from "./authRateLimit";

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

describe("authRateLimit", () => {
  it("keys by IP, not user identity (there is none pre-auth)", async () => {
    mockedRedis.incr.mockResolvedValue(1);
    const req = { ip: "203.0.113.5" } as Request;
    const next = jest.fn() as NextFunction;

    await loginRateLimit(req, mockRes(), next);

    expect(mockedRedis.incr).toHaveBeenCalledWith("ratelimit:auth:login:203.0.113.5");
    expect(next).toHaveBeenCalled();
  });

  it("keeps register and login counters independent for the same IP", async () => {
    mockedRedis.incr.mockResolvedValue(1);
    const req = { ip: "203.0.113.5" } as Request;
    const next = jest.fn() as NextFunction;

    await registerRateLimit(req, mockRes(), next);
    await loginRateLimit(req, mockRes(), next);

    expect(mockedRedis.incr).toHaveBeenCalledWith("ratelimit:auth:register:203.0.113.5");
    expect(mockedRedis.incr).toHaveBeenCalledWith("ratelimit:auth:login:203.0.113.5");
  });

  it("rejects with 429 once the limit is exceeded", async () => {
    mockedRedis.incr.mockResolvedValue(11);
    mockedRedis.ttl.mockResolvedValue(600);
    const req = { ip: "203.0.113.5" } as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await loginRateLimit(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed (503) when Redis is unreachable", async () => {
    mockedRedis.incr.mockRejectedValue(new Error("ECONNREFUSED"));
    const req = { ip: "203.0.113.5" } as Request;
    const res = mockRes();
    const next = jest.fn() as NextFunction;

    await registerRateLimit(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });
});
