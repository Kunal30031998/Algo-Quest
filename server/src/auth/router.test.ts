process.env.JWT_ACCESS_SECRET = "test-access-secret";
process.env.JWT_REFRESH_SECRET = "test-refresh-secret";

import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../app";
import { prisma } from "../db/prisma";
import { Prisma } from "../generated/prisma/client";
import { hashPassword } from "./password";

jest.mock("../db/prisma", () => ({
  prisma: {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockedPrisma = prisma as unknown as {
  user: { [K in "create" | "findUnique" | "findFirst"]: jest.Mock };
  refreshToken: { [K in "create" | "findUnique" | "update"]: jest.Mock };
};

const app = createApp();

const baseUser = {
  id: "user-1",
  email: "ada@example.com",
  username: "ada",
  rating: 1000,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedPrisma.refreshToken.create.mockResolvedValue({});
});

describe("POST /auth/register", () => {
  it("creates a user and returns tokens", async () => {
    mockedPrisma.user.findFirst.mockResolvedValue(null);
    mockedPrisma.user.create.mockResolvedValue({
      ...baseUser,
      passwordHash: "irrelevant",
    });

    const res = await request(app)
      .post("/auth/register")
      .send({ email: "ada@example.com", username: "ada", password: "password123" });

    expect(res.status).toBe(201);
    expect(res.body.user).toEqual(baseUser);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
  });

  it("rejects a short password", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ email: "ada@example.com", username: "ada", password: "short" });

    expect(res.status).toBe(400);
    expect(mockedPrisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects when the pre-check finds an existing user", async () => {
    mockedPrisma.user.findFirst.mockResolvedValue({ ...baseUser, passwordHash: "x" });

    const res = await request(app)
      .post("/auth/register")
      .send({ email: "ada@example.com", username: "ada", password: "password123" });

    expect(res.status).toBe(409);
    expect(mockedPrisma.user.create).not.toHaveBeenCalled();
  });

  it("rejects a race-condition duplicate caught at the DB level", async () => {
    mockedPrisma.user.findFirst.mockResolvedValue(null);
    mockedPrisma.user.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    const res = await request(app)
      .post("/auth/register")
      .send({ email: "ada@example.com", username: "ada", password: "password123" });

    expect(res.status).toBe(409);
  });
});

describe("POST /auth/login", () => {
  it("returns tokens for valid credentials", async () => {
    const passwordHash = await hashPassword("password123");
    mockedPrisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ada@example.com", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(baseUser);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it("rejects an unknown email", async () => {
    mockedPrisma.user.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "password123" });

    expect(res.status).toBe(401);
  });

  it("rejects a wrong password", async () => {
    const passwordHash = await hashPassword("password123");
    mockedPrisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ada@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
  });
});

describe("POST /auth/refresh", () => {
  it("rotates a valid refresh token", async () => {
    mockedPrisma.refreshToken.findUnique.mockResolvedValue({
      id: "rt-1",
      userId: baseUser.id,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60),
    });
    mockedPrisma.refreshToken.update.mockResolvedValue({});

    const res = await request(app).post("/auth/refresh").send({ refreshToken: "some-token" });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(mockedPrisma.refreshToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "rt-1" } }),
    );
  });

  it("rejects an unknown refresh token", async () => {
    mockedPrisma.refreshToken.findUnique.mockResolvedValue(null);

    const res = await request(app).post("/auth/refresh").send({ refreshToken: "bogus" });

    expect(res.status).toBe(401);
  });

  it("rejects a revoked refresh token", async () => {
    mockedPrisma.refreshToken.findUnique.mockResolvedValue({
      id: "rt-1",
      userId: baseUser.id,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60),
    });

    const res = await request(app).post("/auth/refresh").send({ refreshToken: "some-token" });

    expect(res.status).toBe(401);
  });

  it("rejects an expired refresh token", async () => {
    mockedPrisma.refreshToken.findUnique.mockResolvedValue({
      id: "rt-1",
      userId: baseUser.id,
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await request(app).post("/auth/refresh").send({ refreshToken: "some-token" });

    expect(res.status).toBe(401);
  });
});

describe("GET /auth/me", () => {
  it("rejects a missing token", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects an invalid token", async () => {
    const res = await request(app).get("/auth/me").set("Authorization", "Bearer not-a-real-jwt");
    expect(res.status).toBe(401);
  });

  it("rejects an expired token", async () => {
    const expiredToken = jwt.sign({ sub: baseUser.id }, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: -10,
    });

    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  it("returns the current user for a valid token", async () => {
    const token = jwt.sign({ sub: baseUser.id }, process.env.JWT_ACCESS_SECRET!, {
      expiresIn: "15m",
    });
    mockedPrisma.user.findUnique.mockResolvedValue({ ...baseUser, passwordHash: "x" });

    const res = await request(app).get("/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual(baseUser);
  });
});
