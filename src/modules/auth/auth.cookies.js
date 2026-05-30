import { env } from "../../config/env.js";

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    secure: env.AUTH_COOKIE_SECURE,
    sameSite: env.AUTH_COOKIE_SAME_SITE,
    path: `${env.API_PREFIX}/auth`,
    maxAge
  };
}

export function readCookie(req, name) {
  const header = req.headers.cookie || "";
  const cookies = header.split(";").map((item) => item.trim()).filter(Boolean);

  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");

    if (separator === -1) continue;

    const key = decodeURIComponent(cookie.slice(0, separator));

    if (key === name) {
      return decodeURIComponent(cookie.slice(separator + 1));
    }
  }

  return undefined;
}

export function setRefreshCookie(res, refreshToken) {
  res.cookie(
    env.AUTH_REFRESH_COOKIE_NAME,
    refreshToken,
    cookieOptions(env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000)
  );
}

export function clearRefreshCookie(res) {
  res.clearCookie(env.AUTH_REFRESH_COOKIE_NAME, cookieOptions(0));
}

export function setOAuthStateCookie(res, state) {
  res.cookie(
    env.AUTH_OAUTH_STATE_COOKIE_NAME,
    state,
    cookieOptions(10 * 60 * 1000)
  );
}

export function clearOAuthStateCookie(res) {
  res.clearCookie(env.AUTH_OAUTH_STATE_COOKIE_NAME, cookieOptions(0));
}
