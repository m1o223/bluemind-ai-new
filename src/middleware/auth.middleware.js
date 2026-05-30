import { verifyAccessToken } from "../modules/auth/token.service.js";
import { findActiveSession } from "../modules/auth/session.service.js";
import { findUserById } from "../modules/users/user.service.js";
import { AppError } from "../utils/AppError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const requireAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    req.log?.warn({
      authFlow: "require_auth",
      path: req.originalUrl,
      hasAuthorizationHeader: Boolean(header)
    }, "Auth token missing");
    throw new AppError("Authentication token is required", 401, "AUTH_TOKEN_REQUIRED");
  }

  const payload = verifyAccessToken(token);

  if (!payload.sid) {
    req.log?.warn({
      authFlow: "require_auth",
      userId: payload.sub,
      path: req.originalUrl
    }, "Auth token has no session id");
    throw new AppError("Authentication session is required", 401, "AUTH_SESSION_REQUIRED");
  }

  const session = await findActiveSession(payload.sid, payload.sub);

  if (!session) {
    req.log?.warn({
      authFlow: "require_auth",
      userId: payload.sub,
      sessionId: payload.sid,
      path: req.originalUrl
    }, "Auth session inactive");
    throw new AppError("Authentication session is not active", 401, "AUTH_SESSION_INVALID");
  }

  const user = await findUserById(payload.sub);

  if (!user) {
    req.log?.warn({
      authFlow: "require_auth",
      userId: payload.sub,
      sessionId: payload.sid,
      path: req.originalUrl
    }, "Auth user not found");
    throw new AppError("Authenticated user was not found", 401, "AUTH_USER_NOT_FOUND");
  }

  req.user = user;
  req.authSession = session;
  next();
});
