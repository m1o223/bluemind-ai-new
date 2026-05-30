import { env } from "../config/env.js";
import { logger } from "../config/logger.js";

export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) {
    next(error);
    return;
  }

  const statusCode = error.statusCode || 500;
  const isServerError = statusCode >= 500;
  const message = env.NODE_ENV === "production" && isServerError
    ? "Internal server error"
    : error.message;

  if (isServerError) {
    logger.error({
      err: error,
      method: req.method,
      path: req.originalUrl,
      code: error.code
    }, "Request failed");
  } else {
    const log = req.log || logger;
    log.warn({
      err: error,
      method: req.method,
      path: req.originalUrl,
      code: error.code,
      statusCode
    }, "Request rejected");
  }

  res.status(statusCode).json({
    success: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message,
      details: error.details
    }
  });
}
