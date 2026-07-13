import express from "express";
import { authRouter } from "./auth/router";
import { problemsRouter } from "./problems/router";

export function createApp() {
  const app = express();

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth", authRouter);
  app.use("/problems", problemsRouter);

  return app;
}
