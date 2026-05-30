import admin from "firebase-admin";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";

let firebaseApp;
let firebaseInitAttempted = false;

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

export function isFirebaseConfigured() {
  return Boolean(
    env.FIREBASE_SERVICE_ACCOUNT_JSON
    || (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY)
  );
}

export function getFirebaseApp() {
  if (firebaseApp) {
    return firebaseApp;
  }

  if (admin.apps.length) {
    firebaseApp = admin.apps[0];
    return firebaseApp;
  }

  if (firebaseInitAttempted) {
    return null;
  }

  firebaseInitAttempted = true;
  const credential = buildCredential();

  if (!credential) {
    logger.warn("Firebase credentials are not configured; FCM delivery is disabled");
    return null;
  }

  firebaseApp = admin.initializeApp({
    credential,
    projectId: env.FIREBASE_PROJECT_ID
  });
  logger.info("Firebase Admin initialized for reminder notifications");
  return firebaseApp;
}

export async function sendFirebaseMulticast({ tokens, message }) {
  const app = getFirebaseApp();

  if (!app) {
    return {
      success: false,
      skipped: true,
      error: "Firebase is not configured"
    };
  }

  if (!tokens.length) {
    return {
      success: true,
      skipped: true,
      successCount: 0,
      failureCount: 0,
      invalidTokens: [],
      responses: []
    };
  }

  const response = await admin.messaging(app).sendEachForMulticast({
    tokens,
    ...message
  });
  const invalidTokens = [];

  response.responses.forEach((item, index) => {
    const code = item.error?.code || "";

    if (
      code === "messaging/registration-token-not-registered"
      || code === "messaging/invalid-registration-token"
      || code === "messaging/invalid-argument"
    ) {
      invalidTokens.push(tokens[index]);
    }
  });

  return {
    success: response.failureCount === 0 || response.successCount > 0,
    skipped: false,
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens,
    responses: response.responses.map((item) => ({
      success: item.success,
      messageId: item.messageId,
      error: item.error?.message,
      code: item.error?.code
    }))
  };
}
