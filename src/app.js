import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { getDatabaseStatus, isDatabaseConnected } from "./config/database.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import apiRoutes from "./routes/index.js";
import { errorMiddleware } from "./middleware/error.middleware.js";
import { notFoundMiddleware } from "./middleware/notFound.middleware.js";

export const app = express();

app.disable("x-powered-by");

const productionCorsOrigins = [
  "https://bluemind-frontend.vercel.app",
  "https://bluemind-frontend-m1o223s-projects.vercel.app",
  "https://bluemind-frontend-m1o223-m1o223s-projects.vercel.app",
  "https://localhost",
  "http://localhost",
  "capacitor://localhost"
];

function isAllowedCorsOrigin(origin) {
  return (
    !origin ||
    env.corsOrigins.includes("*") ||
    env.corsOrigins.includes(origin) ||
    productionCorsOrigins.includes(origin)
  );
}

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) {
      callback(null, true);
      return;
    }

    const error = new Error(`Origin is not allowed by CORS: ${origin}`);
    error.statusCode = 403;
    error.code = "CORS_ORIGIN_NOT_ALLOWED";

    logger.warn({
      origin,
      allowedOrigins: env.corsOrigins
    }, "CORS origin rejected");

    callback(error);
  },
  credentials: true
}));

app.use(express.json({ limit: env.REQUEST_BODY_LIMIT }));
app.use(pinoHttp({ logger }));

app.use(rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

function buildHealthPayload() {
  const database = getDatabaseStatus();

  return {
    ok: true,
    status: database.connected ? "ok" : "degraded",
    service: "bluemind-ai-backend",
    database
  };
}

app.get("/health", (_req, res) => {
  res.status(200).json(buildHealthPayload());
});

app.get(`${env.API_PREFIX}/health`, (_req, res) => {
  res.status(200).json(buildHealthPayload());
});

app.use(env.API_PREFIX, (req, res, next) => {
  if (isDatabaseConnected()) {
    next();
    return;
  }

  const database = getDatabaseStatus();

  logger.warn({
    method: req.method,
    path: req.originalUrl,
    database
  }, "API request rejected because MongoDB is unavailable");

  res.status(503).json({
    success: false,
    error: {
      code: "DATABASE_UNAVAILABLE",
      message: "MongoDB is not connected. The backend is running, but database-backed APIs are temporarily unavailable.",
      details: {
        database
      }
    }
  });
});

app.use(env.API_PREFIX, apiRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);
