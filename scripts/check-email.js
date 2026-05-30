import "../src/config/env.js";
import { env } from "../src/config/env.js";
import { logger } from "../src/config/logger.js";
import { sendPasswordResetEmail } from "../src/modules/email/email.service.js";

function getArg(name) {
  const prefix = `--${name}=`;
  const item = process.argv.find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length).trim() : "";
}

function masked(value) {
  if (!value) return "<empty>";
  return "<set>";
}

const recipient = getArg("to") || process.env.EMAIL_TEST_TO || env.SMTP_USER || "";

logger.info({
  provider: env.EMAIL_PROVIDER,
  from: env.EMAIL_FROM,
  frontendUrl: env.FRONTEND_URL,
  resendApiKey: masked(env.RESEND_API_KEY),
  smtp: {
    host: env.SMTP_HOST || "<empty>",
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    user: masked(env.SMTP_USER),
    pass: masked(env.SMTP_PASS)
  }
}, "Email configuration loaded");

if (env.EMAIL_PROVIDER === "console") {
  logger.warn("EMAIL_PROVIDER=console is dev-only. No real email will be delivered.");
  process.exit(0);
}

if (!recipient) {
  logger.warn("No recipient configured. Set EMAIL_TEST_TO or run: node scripts/check-email.js --to=you@example.com");
  process.exit(0);
}

try {
  const result = await sendPasswordResetEmail({
    to: recipient,
    name: "BlueMind Tester",
    code: "123456"
  });

  logger.info({
    to: recipient,
    provider: env.EMAIL_PROVIDER,
    messageId: result?.messageId || result?.id,
    accepted: result?.accepted,
    rejected: result?.rejected
  }, "Email smoke test succeeded");
} catch (error) {
  logger.error({
    err: error,
    code: error.code,
    details: error.details
  }, "Email smoke test failed");
  process.exit(1);
}
