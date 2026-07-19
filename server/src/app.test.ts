import request from "supertest";

// app.ts pulls in the real Redis client (via the submissions router's rate
// limiter); mock it so this test doesn't open a real network connection.
jest.mock("./db/redis", () => ({ redis: {} }));

import { createApp } from "./app";

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
