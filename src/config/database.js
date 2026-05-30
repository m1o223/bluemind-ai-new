import mongoose from "mongoose";

import { env } from "./env.js";
import { logger } from "./logger.js";

const READY_STATE = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
  99: "uninitialized"
};

const databaseState = {
  status: READY_STATE[mongoose.connection.readyState] || "unknown",
  attempts: 0,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastError: null,
  reconnectIntervalMs: env.MONGODB_RECONNECT_INTERVAL_MS
};

let reconnectTimer;
let listenersRegistered = false;

function withTimeout(promise, timeoutMs) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error(`MongoDB connection timed out after ${timeoutMs}ms`);
      error.code = "MONGODB_CONNECT_TIMEOUT";
      reject(error);
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function getMongoHost() {
  try {
    if (env.mongodbDirectHosts.length) {
      return env.mongodbDirectHosts.join(",");
    }

    return env.MONGODB_URI
      ? new URL(env.MONGODB_URI.replace("mongodb+srv://", "mongodb://")).host
      : undefined;
  } catch {
    return "invalid-mongodb-uri";
  }
}

function buildDirectMongoUri() {
  if (!env.mongodbDirectHosts.length || !env.MONGODB_URI?.startsWith("mongodb+srv://")) {
    return env.MONGODB_URI;
  }

  const original = new URL(env.MONGODB_URI.replace(/^mongodb\+srv:/, "mongodb:"));
  const params = new URLSearchParams(original.search);
  const database = original.pathname.replace(/^\//, "");

  if (!params.has("authSource")) {
    params.set("authSource", env.MONGODB_AUTH_SOURCE);
  }

  if (env.MONGODB_REPLICA_SET && !params.has("replicaSet")) {
    params.set("replicaSet", env.MONGODB_REPLICA_SET);
  }

  if (env.MONGODB_TLS && !params.has("tls") && !params.has("ssl")) {
    params.set("tls", "true");
  }

  return [
    "mongodb://",
    original.username,
    original.password ? `:${original.password}` : "",
    "@",
    env.mongodbDirectHosts.join(","),
    database ? `/${database}` : "",
    "?",
    params.toString()
  ].join("");
}

function getConnectionMode() {
  return env.mongodbDirectHosts.length ? "direct-seedlist" : "srv";
}

function normalizeError(error) {
  if (!error) {
    return null;
  }

  return {
    code: error.code || error.name || "MONGODB_ERROR",
    name: error.name,
    message: error.message
  };
}

function updateDatabaseStatus(status, error = null) {
  databaseState.status = status;
  databaseState.lastError = normalizeError(error);

  if (status === "connected") {
    databaseState.lastConnectedAt = new Date();
  }

  if (status === "disconnected") {
    databaseState.lastDisconnectedAt = new Date();
  }
}

function registerConnectionListeners() {
  if (listenersRegistered) {
    return;
  }

  listenersRegistered = true;

  mongoose.connection.on("connected", () => {
    updateDatabaseStatus("connected");
    logger.info({ database: mongoose.connection.name }, "MongoDB connected");
  });

  mongoose.connection.on("disconnected", () => {
    updateDatabaseStatus("disconnected");
    logger.warn("MongoDB disconnected");
  });

  mongoose.connection.on("reconnected", () => {
    updateDatabaseStatus("connected");
    logger.info({ database: mongoose.connection.name }, "MongoDB reconnected");
  });

  mongoose.connection.on("error", (error) => {
    databaseState.lastError = normalizeError(error);
    logger.error({
      err: error,
      code: error.code,
      name: error.name
    }, "MongoDB connection error");
  });
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

export function getDatabaseStatus() {
  const readyState = mongoose.connection.readyState;

  return {
    configured: Boolean(env.MONGODB_URI),
    connected: readyState === 1,
    readyState,
    status: READY_STATE[readyState] || databaseState.status || "unknown",
    host: getMongoHost(),
    connectionMode: getConnectionMode(),
    attempts: databaseState.attempts,
    lastConnectedAt: databaseState.lastConnectedAt,
    lastDisconnectedAt: databaseState.lastDisconnectedAt,
    lastError: databaseState.lastError,
    reconnectIntervalMs: databaseState.reconnectIntervalMs
  };
}

export async function connectDatabase({ throwOnFailure = true } = {}) {
  mongoose.set("strictQuery", true);
  mongoose.set("bufferCommands", false);
  registerConnectionListeners();

  logger.info({
    mongoConfigured: Boolean(env.MONGODB_URI),
    mongoHost: getMongoHost(),
    connectionMode: getConnectionMode(),
    attempt: databaseState.attempts + 1
  }, "MongoDB connection starting");

  try {
    databaseState.attempts += 1;
    updateDatabaseStatus("connecting");

    await withTimeout(
      mongoose.connect(buildDirectMongoUri(), {
        autoIndex: env.NODE_ENV !== "production",
        serverSelectionTimeoutMS: env.MONGODB_CONNECT_TIMEOUT_MS,
        connectTimeoutMS: env.MONGODB_CONNECT_TIMEOUT_MS,
        socketTimeoutMS: env.MONGODB_CONNECT_TIMEOUT_MS
      }),
      env.MONGODB_CONNECT_TIMEOUT_MS
    );
  } catch (error) {
    updateDatabaseStatus("disconnected", error);
    logger.error({
      err: error,
      code: error.code,
      name: error.name
    }, "MongoDB connection failed");

    if (throwOnFailure) {
      throw error;
    }

    return false;
  }

  updateDatabaseStatus("connected");
  logger.info({ database: mongoose.connection.name }, "MongoDB connection ready");

  return true;
}

export function startDatabaseReconnectLoop() {
  if (reconnectTimer) {
    return reconnectTimer;
  }

  reconnectTimer = setInterval(() => {
    if (isDatabaseConnected() || mongoose.connection.readyState === 2) {
      return;
    }

    connectDatabase({ throwOnFailure: false }).catch((error) => {
      logger.error({
        err: error,
        code: error.code,
        name: error.name
      }, "MongoDB reconnect attempt crashed");
    });
  }, env.MONGODB_RECONNECT_INTERVAL_MS);

  reconnectTimer.unref?.();

  logger.info({
    reconnectIntervalMs: env.MONGODB_RECONNECT_INTERVAL_MS
  }, "MongoDB reconnect loop started");

  return reconnectTimer;
}

export async function disconnectDatabase() {
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
    reconnectTimer = undefined;
  }

  await mongoose.disconnect();
  logger.info("MongoDB disconnected");
}
