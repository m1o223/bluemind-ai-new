import mongoose from "mongoose";

import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import { findUserById } from "../users/user.service.js";
import { processDueAccountDeletions } from "./accountDeletion.service.js";
import { AuthSession } from "./session.model.js";
import {
  createTokenId,
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken
} from "./token.service.js";

function getRequestMeta(req) {
  return {
    userAgent: String(req.headers["user-agent"] || "").slice(0, 500),
    ipAddress: req.ip || req.socket?.remoteAddress || ""
  };
}

function refreshExpiryDate() {
  return new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
}

function buildAuthPayload(user, session, refreshToken) {
  return {
    user: user.toSafeObject(),
    token: signAccessToken(user, session._id),
    tokenType: "Bearer",
    expiresIn: env.JWT_EXPIRES_IN,
    refreshToken,
    session: {
      id: session._id.toString(),
      expiresAt: session.expiresAt,
      lastUsedAt: session.lastUsedAt
    }
  };
}

export async function createAuthSession(user, req) {
  const sessionId = new mongoose.Types.ObjectId();
  const tokenId = createTokenId();
  const refreshToken = signRefreshToken({
    userId: user._id,
    sessionId,
    tokenId
  });
  const session = await AuthSession.create({
    _id: sessionId,
    userId: user._id,
    refreshTokenHash: hashToken(refreshToken),
    refreshTokenId: tokenId,
    expiresAt: refreshExpiryDate(),
    lastUsedAt: new Date(),
    ...getRequestMeta(req)
  });

  return buildAuthPayload(user, session, refreshToken);
}

export async function findActiveSession(sessionId, userId) {
  if (!sessionId) return null;

  return AuthSession.findOne({
    _id: sessionId,
    userId,
    revokedAt: { $exists: false },
    expiresAt: { $gt: new Date() }
  });
}

export async function refreshAuthSession(refreshToken, req) {
  if (!refreshToken) {
    throw new AppError("Refresh token is required", 401, "AUTH_REFRESH_REQUIRED");
  }

  await processDueAccountDeletions();

  const payload = verifyRefreshToken(refreshToken);
  const session = await AuthSession.findById(payload.sid);

  if (!session || session.revokedAt || session.expiresAt <= new Date()) {
    throw new AppError("Refresh session is not active", 401, "AUTH_SESSION_INVALID");
  }

  if (session.refreshTokenHash !== hashToken(refreshToken) || session.refreshTokenId !== payload.jti) {
    session.revokedAt = new Date();
    session.revokeReason = "refresh_token_reuse_detected";
    await session.save();
    await AuthSession.updateMany({
      userId: session.userId,
      revokedAt: { $exists: false }
    }, {
      $set: {
        revokedAt: new Date(),
        revokeReason: "duplicate_refresh_token_reuse"
      }
    });
    throw new AppError("Refresh token reuse was detected", 401, "AUTH_REFRESH_REUSE_DETECTED");
  }

  const user = await findUserById(session.userId);

  if (!user) {
    throw new AppError("Authenticated user was not found", 401, "AUTH_USER_NOT_FOUND");
  }

  const nextTokenId = createTokenId();
  const nextRefreshToken = signRefreshToken({
    userId: user._id,
    sessionId: session._id,
    tokenId: nextTokenId
  });

  session.refreshTokenId = nextTokenId;
  session.refreshTokenHash = hashToken(nextRefreshToken);
  session.expiresAt = refreshExpiryDate();
  session.lastUsedAt = new Date();
  Object.assign(session, getRequestMeta(req));
  await session.save();

  return buildAuthPayload(user, session, nextRefreshToken);
}

export async function revokeAuthSession(refreshToken, reason = "logout") {
  if (!refreshToken) return { revoked: false };

  try {
    const payload = verifyRefreshToken(refreshToken);
    const session = await AuthSession.findById(payload.sid);

    if (!session || session.revokedAt) {
      return { revoked: false };
    }

    session.revokedAt = new Date();
    session.revokeReason = reason;
    await session.save();

    return { revoked: true, sessionId: session._id.toString() };
  } catch {
    return { revoked: false };
  }
}

export async function revokeUserSessions(userId, reason = "security_update", exceptSessionId = undefined) {
  const filter = {
    userId,
    revokedAt: { $exists: false }
  };

  if (exceptSessionId) {
    filter._id = { $ne: exceptSessionId };
  }

  const result = await AuthSession.updateMany(filter, {
    $set: {
      revokedAt: new Date(),
      revokeReason: reason
    }
  });

  return {
    revoked: result.modifiedCount || 0
  };
}
