import crypto from "node:crypto";

import jwt from "jsonwebtoken";

import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";

export function signAccessToken(user, sessionId) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      sid: sessionId?.toString()
    },
    env.JWT_SECRET,
    {
      expiresIn: env.JWT_EXPIRES_IN
    }
  );
}

export function signRefreshToken({ userId, sessionId, tokenId }) {
  return jwt.sign(
    {
      sub: userId.toString(),
      sid: sessionId.toString(),
      jti: tokenId,
      type: "refresh"
    },
    env.JWT_REFRESH_SECRET || env.JWT_SECRET,
    {
      expiresIn: `${env.JWT_REFRESH_EXPIRES_DAYS}d`
    }
  );
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch {
    throw new AppError("Invalid or expired authentication token", 401, "AUTH_TOKEN_INVALID");
  }
}

export function verifyRefreshToken(token) {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET || env.JWT_SECRET);

    if (payload.type !== "refresh") {
      throw new Error("Invalid token type");
    }

    return payload;
  } catch {
    throw new AppError("Invalid or expired refresh token", 401, "AUTH_REFRESH_INVALID");
  }
}

export function signOAuthState(payload) {
  return jwt.sign(
    {
      ...payload,
      type: "oauth_state"
    },
    env.JWT_SECRET,
    {
      expiresIn: "10m"
    }
  );
}

export function verifyOAuthState(token) {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET);

    if (payload.type !== "oauth_state") {
      throw new Error("Invalid state type");
    }

    return payload;
  } catch {
    throw new AppError("Invalid Google sign-in state", 401, "GOOGLE_OAUTH_STATE_INVALID");
  }
}

export function createTokenId() {
  return crypto.randomUUID();
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
