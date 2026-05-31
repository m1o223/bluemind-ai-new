import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendResponse } from "../../utils/sendResponse.js";
import {
  clearOAuthStateCookie,
  clearRefreshCookie,
  readCookie,
  setOAuthStateCookie,
  setRefreshCookie
} from "./auth.cookies.js";
import {
  changePassword,
  confirmEmailChange,
  requestEmailChange,
  requestPasswordReset,
  resendEmailVerification,
  resetPassword,
  verifyEmail,
  loginGuest,
  loginUser,
  logoutSession,
  refreshSession,
  registerUser,
  updateUserPreferences
} from "./auth.service.js";
import {
  createGoogleAuthorization,
  loginWithGoogleCode,
  verifyGoogleState
} from "./google.service.js";
import { env } from "../../config/env.js";

function sendAuthResponse(res, statusCode, result) {
  if (!result.refreshToken) {
    sendResponse(res, statusCode, result);
    return;
  }

  setRefreshCookie(res, result.refreshToken);
  const { refreshToken: _refreshToken, ...safeResult } = result;

  sendResponse(res, statusCode, safeResult);
}

export const register = asyncHandler(async (req, res) => {
  req.log.info({
    authFlow: "register",
    email: req.validated.body.email,
    origin: req.headers.origin,
    hasCookie: Boolean(req.headers.cookie)
  }, "Auth register started");

  const result = await registerUser(req.validated.body, req);

  req.log.info({
    authFlow: "register",
    userId: result.user.id,
    email: result.user.email,
    verificationRequired: Boolean(result.verification?.required)
  }, "Auth register succeeded");

  sendAuthResponse(res, 201, result);
});

export const verifyEmailCode = asyncHandler(async (req, res) => {
  req.log.info({
    authFlow: "verify_email",
    email: req.validated.body.email
  }, "Email verification started");

  const result = await verifyEmail(req.validated.body, req);

  req.log.info({
    authFlow: "verify_email",
    userId: result.user.id,
    sessionId: result.session.id
  }, "Email verification succeeded");

  sendAuthResponse(res, 200, result);
});

export const resendVerification = asyncHandler(async (req, res) => {
  const result = await resendEmailVerification(req.validated.body);

  req.log.info({
    authFlow: "resend_verification",
    email: req.validated.body.email,
    sent: result.sent,
    alreadyVerified: result.alreadyVerified
  }, "Verification code resend processed");

  sendResponse(res, 200, result);
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const result = await requestPasswordReset(req.validated.body);

  req.log.info({
    authFlow: "forgot_password",
    email: req.validated.body.email,
    sent: result.sent
  }, "Password reset request processed");

  sendResponse(res, 200, result);
});

export const resetPasswordWithCode = asyncHandler(async (req, res) => {
  const result = await resetPassword(req.validated.body);
  clearRefreshCookie(res);

  req.log.info({
    authFlow: "reset_password",
    email: req.validated.body.email
  }, "Password reset completed");

  sendResponse(res, 200, result);
});

export const login = asyncHandler(async (req, res) => {
  req.log.info({
    authFlow: "login",
    email: req.validated.body.email,
    origin: req.headers.origin,
    hasCookie: Boolean(req.headers.cookie)
  }, "Auth login started");

  const result = await loginUser(req.validated.body, req);

  req.log.info({
    authFlow: "login",
    userId: result.user.id,
    sessionId: result.session.id,
    email: result.user.email
  }, "Auth login succeeded");

  sendAuthResponse(res, 200, result);
});

export const guest = asyncHandler(async (req, res) => {
  req.log.info({
    authFlow: "guest",
    origin: req.headers.origin,
    hasCookie: Boolean(req.headers.cookie)
  }, "Guest auth started");

  const result = await loginGuest(req);

  req.log.info({
    authFlow: "guest",
    userId: result.user.id,
    sessionId: result.session.id
  }, "Guest auth succeeded");

  sendAuthResponse(res, 201, result);
});

export const getMe = asyncHandler(async (req, res) => {
  sendResponse(res, 200, {
    user: req.user.toSafeObject()
  });
});

export const refresh = asyncHandler(async (req, res) => {
  const refreshToken = readCookie(req, env.AUTH_REFRESH_COOKIE_NAME) || req.validated.body.refreshToken;
  req.log.info({
    authFlow: "refresh",
    hasRefreshCookie: Boolean(readCookie(req, env.AUTH_REFRESH_COOKIE_NAME)),
    hasBodyRefreshToken: Boolean(req.validated.body.refreshToken),
    origin: req.headers.origin
  }, "Auth refresh started");

  const result = await refreshSession(refreshToken, req);

  req.log.info({
    authFlow: "refresh",
    userId: result.user.id,
    sessionId: result.session.id
  }, "Auth refresh succeeded");

  sendAuthResponse(res, 200, result);
});

export const logout = asyncHandler(async (req, res) => {
  const refreshToken = readCookie(req, env.AUTH_REFRESH_COOKIE_NAME) || req.validated.body.refreshToken;
  req.log.info({
    authFlow: "logout",
    hasRefreshCookie: Boolean(readCookie(req, env.AUTH_REFRESH_COOKIE_NAME)),
    hasBodyRefreshToken: Boolean(req.validated.body.refreshToken)
  }, "Auth logout started");

  const result = await logoutSession(refreshToken);
  clearRefreshCookie(res);
  req.log.info({
    authFlow: "logout",
    revoked: result.revoked,
    sessionId: result.sessionId
  }, "Auth logout completed");
  sendResponse(res, 200, result);
});

export const updatePreferences = asyncHandler(async (req, res) => {
  const user = await updateUserPreferences(req.user, req.validated.body);
  sendResponse(res, 200, { user });
});

export const requestChangeEmail = asyncHandler(async (req, res) => {
  const result = await requestEmailChange(req.user, req.validated.body);

  req.log.info({
    authFlow: "change_email_request",
    userId: req.user._id.toString(),
    pendingEmail: result.pendingEmail
  }, "Email change verification sent");

  sendResponse(res, 200, result);
});

export const confirmChangeEmail = asyncHandler(async (req, res) => {
  const result = await confirmEmailChange(req.user, req.validated.body, req);

  req.log.info({
    authFlow: "change_email_confirm",
    userId: req.user._id.toString(),
    email: result.user.email
  }, "Email change confirmed");

  sendResponse(res, 200, result);
});

export const updatePassword = asyncHandler(async (req, res) => {
  const result = await changePassword(req.user, req.validated.body, req);

  req.log.info({
    authFlow: "change_password",
    userId: req.user._id.toString()
  }, "Password changed");

  sendResponse(res, 200, result);
});

export const startGoogleLogin = asyncHandler(async (req, res) => {
  req.log.info({
    authFlow: "google_start",
    origin: req.headers.origin,
    accept: req.headers.accept
  }, "Google auth start requested");

  try {
    const { url, state } = createGoogleAuthorization();
    setOAuthStateCookie(res, state);
    req.log.info({ authFlow: "google_start" }, "Google auth redirect created");
    res.redirect(url);
  } catch (error) {
    req.log.warn({
      authFlow: "google_start",
      code: error.code,
      message: error.message
    }, "Google auth start failed");

    const wantsHtml = req.headers.accept?.includes("text/html");

    if (wantsHtml && error.code === "GOOGLE_OAUTH_NOT_CONFIGURED") {
      const redirectUrl = new URL("/auth/login", env.FRONTEND_URL);
      redirectUrl.searchParams.set("authError", error.code);
      res.redirect(redirectUrl.toString());
      return;
    }

    throw error;
  }
});

export const googleCallback = asyncHandler(async (req, res) => {
  const stateCookie = readCookie(req, env.AUTH_OAUTH_STATE_COOKIE_NAME);
  req.log.info({
    authFlow: "google_callback",
    hasCode: Boolean(req.validated.query.code),
    hasState: Boolean(req.validated.query.state),
    hasStateCookie: Boolean(stateCookie)
  }, "Google auth callback started");

  verifyGoogleState({
    state: req.validated.query.state,
    stateCookie
  });

  const result = await loginWithGoogleCode({
    code: req.validated.query.code,
    req
  });

  setRefreshCookie(res, result.refreshToken);
  clearOAuthStateCookie(res);
  req.log.info({
    authFlow: "google_callback",
    userId: result.user.id,
    sessionId: result.session.id,
    email: result.user.email
  }, "Google auth callback succeeded");
  res.redirect(`${env.FRONTEND_URL}/auth/google/callback`);
});
