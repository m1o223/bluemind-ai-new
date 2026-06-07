import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envBoolean = (defaultValue) => z.preprocess((value) => {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean()).default(defaultValue);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  API_PREFIX: z.string().trim().default("/api"),
  CORS_ORIGIN: z.string().trim().default("https://bluemind-frontend.vercel.app"),
  REQUEST_BODY_LIMIT: z.string().trim().default("1mb"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  MONGODB_URI: z.string().trim().optional(),
  MONGO_URI: z.string().trim().optional(),
  MONGODB_DIRECT_HOSTS: z.string().trim().optional(),
  MONGODB_REPLICA_SET: z.string().trim().optional(),
  MONGODB_AUTH_SOURCE: z.string().trim().default("admin"),
  MONGODB_TLS: z.coerce.boolean().default(true),
  MONGODB_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(1000).default(15000),
  MONGODB_RECONNECT_INTERVAL_MS: z.coerce.number().int().min(1000).default(10000),
  JWT_SECRET: z.string().trim().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN: z.string().trim().default("15m"),
  JWT_REFRESH_SECRET: z.string().trim().optional(),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  AUTH_REFRESH_COOKIE_NAME: z.string().trim().default("bluemind_refresh"),
  AUTH_COOKIE_SECURE: z.coerce.boolean().default(false),
  AUTH_COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).default("lax"),
  EMAIL_PROVIDER: z.enum(["console", "resend", "smtp"]).default("console"),
  EMAIL_FROM: z.string().trim().default("BlueMind AI <no-reply@bluemind.ai>"),
  EMAIL_DEV_MODE: z.coerce.boolean().default(true),
  RESEND_API_KEY: z.string().trim().optional(),
  SMTP_HOST: z.string().trim().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: envBoolean(false),
  SMTP_USER: z.string().trim().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_REJECT_UNAUTHORIZED: envBoolean(true),
  EMAIL_SEND_RETRIES: z.coerce.number().int().min(0).max(3).default(2),
  EMAIL_SEND_RETRY_DELAY_MS: z.coerce.number().int().min(100).max(10000).default(750),
  EMAIL_SEND_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(12000),
  EMAIL_VERIFICATION_CODE_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(10),
  PASSWORD_RESET_CODE_TTL_MINUTES: z.coerce.number().int().min(5).max(120).default(15),
  AUTH_CODE_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  AUTH_CODE_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(15).max(3600).default(60),
  FRONTEND_URL: z.string().trim().default("https://bluemind-frontend.vercel.app"),
  BACKEND_PUBLIC_URL: z.string().trim().default("https://bluemind-ai-new.onrender.com"),
  OPENAI_API_KEY: z.string().trim().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().trim().default("gpt-4.1-mini"),
  OPENAI_INSTANT_MODEL: z.string().trim().optional(),
  OPENAI_THINKING_MODEL: z.string().trim().optional(),
  OPENAI_DEEP_THINKING_MODEL: z.string().trim().optional(),
  OPENAI_VISION_MODEL: z.string().trim().default("gpt-4.1-mini"),
  OPENAI_IMAGE_MODEL: z.string().trim().default("gpt-image-1"),
  OPENAI_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.7),
  DEFAULT_TIMEZONE: z.string().trim().default("UTC"),
  IMAGE_UPLOAD_DIR: z.string().trim().default("uploads/images"),
  IMAGE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(8 * 1024 * 1024),
  IMAGE_CHAT_MAX_ATTACHMENTS: z.coerce.number().int().min(1).max(8).default(4),
  IMAGE_GENERATION_MAX_RESULTS: z.coerce.number().int().min(1).max(4).default(1),
  REMINDER_SCHEDULER_ENABLED: z.coerce.boolean().default(true),
  REMINDER_SCHEDULER_CRON: z.string().trim().default("* * * * *"),
  REMINDER_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(50),
  REMINDER_RETRY_DELAY_MS: z.coerce.number().int().min(1000).default(5 * 60 * 1000),
  REMINDER_MAX_NOTIFICATION_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  REMINDER_MISSED_AFTER_MINUTES: z.coerce.number().int().min(1).max(1440).default(60),
  FIREBASE_PROJECT_ID: z.string().trim().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().trim().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(),
  FIREBASE_SERVICE_ACCOUNT_JSON: z.string().optional(),
  WEB_PUSH_PUBLIC_KEY: z.string().trim().optional(),
  WEB_PUSH_PRIVATE_KEY: z.string().trim().optional(),
  WEB_PUSH_SUBJECT: z.string().trim().default("mailto:no-reply@bluemind.ai"),
  MEMORY_MAX_MESSAGES: z.coerce.number().int().min(2).max(100).default(24),
  MEMORY_SHORT_TERM_MESSAGES: z.coerce.number().int().min(2).max(40).default(12),
  MEMORY_RETRIEVAL_LIMIT: z.coerce.number().int().min(1).max(30).default(8),
  MEMORY_PINNED_LIMIT: z.coerce.number().int().min(1).max(30).default(8),
  MEMORY_CONTEXT_MAX_CHARS: z.coerce.number().int().min(2000).max(50000).default(12000),
  MEMORY_SUMMARY_AFTER_MESSAGES: z.coerce.number().int().min(4).max(200).default(18),
  MEMORY_SUMMARY_INTERVAL_MESSAGES: z.coerce.number().int().min(2).max(100).default(8),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120)
}).superRefine((data, context) => {
  if (!data.MONGODB_URI && !data.MONGO_URI) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["MONGODB_URI"],
      message: "MONGODB_URI is required"
    });
  }

  if (data.NODE_ENV === "production" && data.EMAIL_PROVIDER === "resend" && !data.RESEND_API_KEY) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["RESEND_API_KEY"],
      message: "RESEND_API_KEY is required when EMAIL_PROVIDER=resend in production"
    });
  }

  if (data.EMAIL_PROVIDER === "smtp") {
    for (const field of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS"]) {
      if (!data[field]) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: `${field} is required when EMAIL_PROVIDER=smtp`
        });
      }
    }
  }
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("; ");

  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = {
  ...parsed.data,
  MONGODB_URI: parsed.data.MONGODB_URI || parsed.data.MONGO_URI,
  mongodbDirectHosts: (parsed.data.MONGODB_DIRECT_HOSTS || "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean),
  corsOrigins: parsed.data.CORS_ORIGIN
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)
};
