import { Router } from "express";
import { Prisma } from "../generated/prisma/client";
import { prisma } from "../db/prisma";
import { requireAuth } from "./middleware";
import { comparePassword, hashPassword } from "./password";
import { generateRefreshToken, hashRefreshToken, signAccessToken } from "./tokens";
import { loginRateLimit, registerRateLimit } from "../rateLimit/authRateLimit";

export const authRouter = Router();

function toPublicUser(user: { id: string; email: string; username: string; rating: number }) {
  return { id: user.id, email: user.email, username: user.username, rating: user.rating };
}

async function issueTokens(userId: string) {
  const accessToken = signAccessToken(userId);
  const refresh = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
    },
  });

  return { accessToken, refreshToken: refresh.token };
}

authRouter.post("/register", registerRateLimit, async (req, res) => {
  const { email, username, password } = req.body ?? {};

  if (
    typeof email !== "string" ||
    typeof username !== "string" ||
    typeof password !== "string" ||
    !email.includes("@") ||
    username.length < 3 ||
    password.length < 8
  ) {
    res.status(400).json({ error: "Invalid email, username, or password" });
    return;
  }

  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { username }] },
  });
  if (existing) {
    res.status(409).json({ error: "Email or username already in use" });
    return;
  }

  const passwordHash = await hashPassword(password);

  let user;
  try {
    user = await prisma.user.create({
      data: { email, username, passwordHash },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      res.status(409).json({ error: "Email or username already in use" });
      return;
    }
    throw error;
  }

  const tokens = await issueTokens(user.id);
  res.status(201).json({ user: toPublicUser(user), ...tokens });
});

authRouter.post("/login", loginRateLimit, async (req, res) => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Invalid email or password" });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordMatches = user ? await comparePassword(password, user.passwordHash) : false;

  if (!user || !passwordMatches) {
    res.status(401).json({ error: "Invalid email or password" });
    return;
  }

  const tokens = await issueTokens(user.id);
  res.status(200).json({ user: toPublicUser(user), ...tokens });
});

authRouter.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body ?? {};

  if (typeof refreshToken !== "string") {
    res.status(400).json({ error: "Invalid refresh token" });
    return;
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    res.status(401).json({ error: "Invalid or expired refresh token" });
    return;
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const tokens = await issueTokens(stored.userId);
  res.status(200).json(tokens);
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId } });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.status(200).json({ user: toPublicUser(user) });
});
