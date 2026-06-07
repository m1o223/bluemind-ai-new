import crypto from "node:crypto";

import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import { upsertUserMemory } from "../memory/memory.repository.js";
import {
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  linkGoogleIdentity,
  updateLastLogin
} from "../users/user.service.js";
import { createAuthSession } from "./session.service.js";
import { signOAuthState, verifyOAuthState } from "./token.service.js";
import { verifyFirebaseIdToken } from "./firebase-auth.service.js";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

function assertGoogleConfigured() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    throw new AppError("Google OAuth is not configured", 503, "GOOGLE_OAUTH_NOT_CONFIGURED");
  }
}

function googleRedirectUri() {
  return env.GOOGLE_REDIRECT_URI || `${env.BACKEND_PUBLIC_URL}${env.API_PREFIX}/auth/google/callback`;
}

export function createGoogleAuthorization() {
  assertGoogleConfigured();

  const nonce = crypto.randomUUID();
  const state = signOAuthState({ nonce });
  const url = new URL(GOOGLE_AUTH_URL);

  url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", googleRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("access_type", "offline");

  return { url: url.toString(), state };
}

export function verifyGoogleState({ state, stateCookie }) {
  if (!state || !stateCookie || state !== stateCookie) {
    throw new AppError("Invalid Google sign-in state", 401, "GOOGLE_OAUTH_STATE_INVALID");
  }

  return verifyOAuthState(state);
}

async function saveGoogleIdentityMemory(user) {
  await upsertUserMemory(user._id, {
    type: "profile",
    key: "profile:identity",
    content: `The user's name is ${user.name}. Their email is ${user.email}. They signed in with ${user.authProvider}.`,
    tags: ["identity", "profile", "google"],
    importance: 0.95,
    confidence: 0.95,
    pinned: true,
    source: {
      kind: "manual"
    },
    metadata: {
      userId: user._id.toString(),
      provider: user.authProvider,
      googleLinked: Boolean(user.googleId),
      lastLoginAt: user.lastLoginAt
    }
  });
}

async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: googleRedirectUri(),
    grant_type: "authorization_code"
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.id_token) {
    throw new AppError("Google token exchange failed", 502, "GOOGLE_TOKEN_EXCHANGE_FAILED", {
      providerStatus: response.status,
      providerError: payload.error,
      providerDescription: payload.error_description
    });
  }

  return payload;
}

async function verifyGoogleIdToken(idToken) {
  const url = new URL(GOOGLE_TOKENINFO_URL);
  url.searchParams.set("id_token", idToken);

  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new AppError("Google identity verification failed", 401, "GOOGLE_ID_TOKEN_INVALID", {
      providerStatus: response.status,
      providerError: payload.error
    });
  }

  if (payload.aud !== env.GOOGLE_CLIENT_ID) {
    throw new AppError("Google identity audience is invalid", 401, "GOOGLE_ID_TOKEN_AUDIENCE_INVALID");
  }

  if (!["accounts.google.com", "https://accounts.google.com"].includes(payload.iss)) {
    throw new AppError("Google identity issuer is invalid", 401, "GOOGLE_ID_TOKEN_ISSUER_INVALID");
  }

  if (payload.email_verified !== "true" && payload.email_verified !== true) {
    throw new AppError("Google email is not verified", 401, "GOOGLE_EMAIL_NOT_VERIFIED");
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name || payload.email?.split("@")[0] || "Google User",
    avatarUrl: payload.picture || "",
    emailVerified: true
  };
}

export async function loginWithGoogleCode({ code, req }) {
  assertGoogleConfigured();

  if (!code) {
    throw new AppError("Google authorization code is required", 400, "GOOGLE_CODE_REQUIRED");
  }

  const tokens = await exchangeCodeForTokens(code);
  const profile = await verifyGoogleIdToken(tokens.id_token);

  return loginWithGoogleProfile({ profile, req });
}

export async function loginWithFirebaseGoogleToken({ idToken, req }) {
  const profile = await verifyFirebaseIdToken(idToken);
  return loginWithGoogleProfile({ profile, req });
}

async function loginWithGoogleProfile({ profile, req }) {
  let user = await findUserByGoogleId(profile.googleId);

  if (!user) {
    user = await findUserByEmail(profile.email);
  }

  if (user) {
    if (user.googleId !== profile.googleId) {
      user = await linkGoogleIdentity(user, profile);
    } else {
      user.name = user.name || profile.name;
      user.avatarUrl = profile.avatarUrl || user.avatarUrl || "";
      user.emailVerified = true;
      user = await updateLastLogin(user);
    }
  } else {
    user = await createUser({
      name: profile.name,
      email: profile.email,
      passwordHash: "",
      authProvider: "google",
      googleId: profile.googleId,
      avatarUrl: profile.avatarUrl,
      emailVerified: true,
      lastLoginAt: new Date()
    });
  }

  await saveGoogleIdentityMemory(user);

  return createAuthSession(user, req);
}
