import request from "supertest";
import { createApp } from "./app";

describe("GET /health", () => {
  it("returns ok status", async () => {
    const res = await request(createApp()).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});
