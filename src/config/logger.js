import pino from "pino";

import { env } from "./env.js";

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: "bluemind-ai-backend"
  },
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "res.headers[\"set-cookie\"]"
    ],
    censor: "[redacted]"
  }
});
