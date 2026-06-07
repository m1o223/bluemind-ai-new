import admin from "firebase-admin";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";

const FIREBASE_AUTH_APP_NAME = "bluemind-auth";

function parseServiceAccountJson() {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return null;
  }

  try {
    return JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch (error) {
    logger.error({ error }, "Invalid FIREBASE_SERVICE_ACCOUNT_JSON");
    return null;
  }
}

function buildCredential() {
  const serviceAccount = parseServiceAccountJson();

  if (serviceAccount) {
    return admin.credential.cert(serviceAccount);
  }

  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    return admin.credential.cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    });
  }

  return null;
}

function getFirebaseAuthApp() {
  const existingNamedApp = admin.apps.find((app) => app?.name === FIREBASE_AUTH_APP_NAME);

  if (existingNamedApp) {
    return existingNamedApp;
  }

  const credential = buildCredential();

  if (!env.FIREBASE_PROJECT_ID && !credential) {
    throw new AppError("Firebase Authentication is not configured", 503, "FIREBASE_AUTH_NOT_CONFIGURED");
  }

  return admin.initializeApp({
    ...(credential ? { credential } : {}),
    projectId: env.FIREBASE_PROJECT_ID
  }, FIREBASE_AUTH_APP_NAME);
}

export async function verifyFirebaseIdToken(idToken) {
  if (!idToken) {
    throw new AppError("Firebase ID token is required", 400, "FIREBASE_ID_TOKEN_REQUIRED");
  }

  try {
    const app = getFirebaseAuthApp();
    const decoded = await admin.auth(app).verifyIdToken(idToken);

    if (!decoded.email || decoded.email_verified === false) {
      throw new AppError("Google email is not verified", 401, "GOOGLE_EMAIL_NOT_VERIFIED");
    }

    return {
      googleId: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.email.split("@")[0] || "Google User",
      avatarUrl: decoded.picture || "",
      emailVerified: true
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("Firebase Google sign-in verification failed", 401, "FIREBASE_ID_TOKEN_INVALID", {
      providerCode: error?.code,
      providerMessage: error?.message
    });
  }
}
