import nodemailer from "nodemailer";

import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { AppError } from "../../utils/AppError.js";

let smtpTransporterPromise;

function effectiveEmailTimeoutMs() {
  return Math.min(env.EMAIL_SEND_TIMEOUT_MS, 12000);
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function withEmailTimeout(promise) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      const error = new Error(`Email provider timed out after ${effectiveEmailTimeoutMs()}ms`);
      error.code = "EMAIL_PROVIDER_TIMEOUT";
      reject(error);
    }, effectiveEmailTimeoutMs());
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

function publicFrontendUrl(pathname) {
  return new URL(pathname, env.FRONTEND_URL).toString();
}

function logoUrl() {
  return publicFrontendUrl("/bluemind-logo-black.png");
}

function buildHtml({ title, intro, code, outro, actionLabel, actionUrl }) {
  const safeAction = actionUrl
    ? `<a href="${actionUrl}" class="button" style="display:inline-block;background:#193B68;color:#ffffff;text-decoration:none;font-weight:700;border-radius:12px;padding:13px 18px;margin:18px 0 6px">${actionLabel}</a>`
    : "";

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <meta name="color-scheme" content="light dark">
        <meta name="supported-color-schemes" content="light dark">
        <style>
          @media (prefers-color-scheme: dark) {
            .email-body { background: #07111f !important; color: #e5edf7 !important; }
            .email-shell { background: #0d1726 !important; border-color: #203047 !important; box-shadow: none !important; }
            .email-title { color: #f8fafc !important; }
            .email-copy { color: #cbd5e1 !important; }
            .code-card { background: #111f33 !important; border-color: #2b3e5b !important; color: #f8fafc !important; }
            .muted { color: #94a3b8 !important; }
            .divider { background: #203047 !important; }
            .button { background: #4f8bd6 !important; color: #ffffff !important; }
          }
          @media (max-width: 520px) {
            .email-container { padding: 18px 10px !important; }
            .email-content { padding: 8px 20px 24px !important; }
            .code-card { font-size: 28px !important; letter-spacing: 7px !important; }
          }
        </style>
      </head>
      <body class="email-body" style="margin:0;background:#f6f8fb;font-family:Inter,Arial,sans-serif;color:#101827">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0">${intro}</div>
        <table class="email-container" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;padding:28px 12px">
          <tr>
            <td align="center">
              <table class="email-shell" role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e5ebf3;border-radius:22px;overflow:hidden;box-shadow:0 14px 45px rgba(15,23,42,.08)">
                <tr>
                  <td style="padding:28px 28px 8px;text-align:center">
                    <img src="${logoUrl()}" width="54" height="54" alt="BlueMind AI" style="display:block;margin:0 auto 12px;width:54px;height:54px;object-fit:contain">
                    <div style="font-size:14px;font-weight:800;color:#193B68;letter-spacing:.04em;text-transform:uppercase">BlueMind AI</div>
                  </td>
                </tr>
                <tr>
                  <td class="email-content" style="padding:8px 30px 30px">
                    <h1 class="email-title" style="font-size:26px;line-height:1.25;margin:0 0 14px;color:#0f172a;text-align:center">${title}</h1>
                    <p class="email-copy" style="font-size:16px;line-height:1.7;margin:0 0 18px;color:#334155;text-align:center">${intro}</p>
                    <div class="code-card" style="font-size:34px;letter-spacing:10px;font-weight:800;background:#eef4fb;border:1px solid #dbe7f5;border-radius:16px;padding:18px 20px;text-align:center;color:#0f172a">${code}</div>
                    <div style="text-align:center">${safeAction}</div>
                    <p class="muted" style="font-size:14px;line-height:1.65;margin:18px 0 0;color:#64748b;text-align:center">${outro}</p>
                    <div class="divider" style="height:1px;background:#e5ebf3;margin:24px 0 16px"></div>
                    <p class="muted" style="font-size:12px;line-height:1.6;margin:0;color:#94a3b8;text-align:center">For your security, never share this code with anyone. BlueMind AI will never ask for it outside the app.</p>
                    <p class="muted" style="font-size:12px;line-height:1.6;margin:10px 0 0;color:#94a3b8;text-align:center">BlueMind AI Security Team</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `.trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildSupportIssueHtml({ title, description, accountEmail, timestamp, appVersion, platform }) {
  const rows = [
    ["Account email", accountEmail],
    ["Timestamp", timestamp],
    ["App version", appVersion],
    ["Platform", platform]
  ].map(([label, value]) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #e5ebf3;color:#64748b;font-size:13px;font-weight:700">${escapeHtml(label)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #e5ebf3;color:#0f172a;font-size:14px;font-weight:600">${escapeHtml(value)}</td>
    </tr>
  `).join("");

  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
      </head>
      <body style="margin:0;background:#f6f8fb;font-family:Inter,Arial,sans-serif;color:#101827">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f8fb;padding:28px 12px">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;background:#ffffff;border:1px solid #e5ebf3;border-radius:22px;overflow:hidden;box-shadow:0 14px 45px rgba(15,23,42,.08)">
                <tr>
                  <td style="padding:28px 30px 16px">
                    <div style="font-size:13px;font-weight:900;color:#193B68;letter-spacing:.04em;text-transform:uppercase">BlueMind AI Support</div>
                    <h1 style="font-size:26px;line-height:1.25;margin:10px 0 0;color:#0f172a">${escapeHtml(title)}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 30px 22px">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5ebf3;border-radius:16px;overflow:hidden">
                      ${rows}
                    </table>
                    <h2 style="font-size:16px;margin:24px 0 8px;color:#0f172a">Issue description</h2>
                    <div style="white-space:pre-wrap;font-size:15px;line-height:1.7;color:#334155;background:#f8fafc;border:1px solid #e5ebf3;border-radius:16px;padding:16px">${escapeHtml(description)}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `.trim();
}

function hasPlaceholderSmtpPassword() {
  return !env.SMTP_PASS || env.SMTP_PASS.trim() === "GMAIL_APP_PASSWORD";
}

function smtpPassword() {
  if (/gmail\.com$/i.test(env.SMTP_HOST || "")) {
    return env.SMTP_PASS.replace(/\s+/g, "");
  }

  return env.SMTP_PASS;
}

function smtpTransportOptions(overrides = {}) {
  return {
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    connectionTimeout: effectiveEmailTimeoutMs(),
    greetingTimeout: effectiveEmailTimeoutMs(),
    socketTimeout: effectiveEmailTimeoutMs(),
    auth: {
      user: env.SMTP_USER,
      pass: smtpPassword()
    },
    tls: {
      rejectUnauthorized: env.SMTP_REJECT_UNAUTHORIZED
    },
    ...overrides
  };
}

function smtpConnectionCandidates() {
  const primary = smtpTransportOptions();
  const candidates = [];
  const isGmail = /(^|\.)gmail\.com$/i.test(env.SMTP_HOST || "") || /smtp\.gmail\.com/i.test(env.SMTP_HOST || "");

  if (isGmail) {
    candidates.push(smtpTransportOptions({ port: 465, secure: true }));
  }

  candidates.push(primary);

  if (isGmail && (env.SMTP_PORT !== 465 || env.SMTP_SECURE !== true)) {
    candidates.push(smtpTransportOptions({ port: 465, secure: true }));
  }

  if (isGmail && (env.SMTP_PORT !== 587 || env.SMTP_SECURE !== false)) {
    candidates.push(smtpTransportOptions({ port: 587, secure: false }));
  }

  return candidates.filter((candidate, index, list) => (
    list.findIndex((item) => item.host === candidate.host && item.port === candidate.port && item.secure === candidate.secure) === index
  ));
}

function emailProviderDetails(error, provider) {
  if (error instanceof AppError && error.details) {
    return {
      provider,
      providerCode: error.code,
      providerStatus: error.statusCode,
      providerMessage: error.details.providerMessage || error.message,
      hint: error.details.hint,
      ...error.details
    };
  }

  const providerMessage = error?.response || error?.message || "Unknown email delivery error";
  const gmailHint = provider === "smtp" && /gmail|username and password|invalid login|application-specific password|app password/i.test(providerMessage)
    ? "If you use Gmail SMTP, use a Gmail App Password instead of your normal account password."
    : undefined;

  return {
    provider,
    providerCode: error?.code || error?.command || "EMAIL_PROVIDER_ERROR",
    providerStatus: error?.responseCode || error?.statusCode || error?.status,
    providerMessage,
    hint: gmailHint
  };
}

function isNonRetryableEmailError(error) {
  return (
    error instanceof AppError ||
    error?.code === "EAUTH" ||
    error?.code === "EMAIL_PROVIDER_TIMEOUT" ||
    error?.responseCode === 535 ||
    /badcredentials|username and password not accepted|invalid login/i.test(error?.response || error?.message || "")
  );
}

function emailFailureMessage(details) {
  if (details.providerCode === "EMAIL_SMTP_APP_PASSWORD_REQUIRED") {
    return "SMTP configuration is missing a real Gmail App Password.";
  }

  if (details.providerCode === "EAUTH" || details.providerStatus === 535) {
    return "SMTP auth failed: Gmail rejected login. Check SMTP_USER and Gmail App Password.";
  }

  if (/timeout|timed out|ETIMEDOUT/i.test(details.providerMessage || "")) {
    return "SMTP connection timeout. Check SMTP_HOST, SMTP_PORT, network access, and Gmail availability.";
  }

  if (/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ESOCKET/i.test(details.providerCode || details.providerMessage || "")) {
    return "SMTP connection failed. Check SMTP_HOST, SMTP_PORT, DNS, and network access.";
  }

  if (/missing|required|not configured/i.test(details.providerMessage || "")) {
    return "Email provider configuration is incomplete. Check backend email environment variables.";
  }

  return "Email delivery failed. Check backend SMTP logs for the provider response.";
}

function publicEmailFailureMessage(purpose) {
  if (purpose === "password_reset") {
    return "We couldn't send the reset code right now. Please try again later.";
  }

  if (purpose === "email_verification" || purpose === "email_change") {
    return "We couldn't send the verification code right now. Please try again later.";
  }

  if (purpose === "support_issue_report") {
    return "We couldn't send your support request right now. Please try again later.";
  }

  return "We couldn't send this email right now. Please try again later.";
}

function toEmailSendError(error, provider, purpose) {
  const details = {
    ...emailProviderDetails(error, provider),
    ...(error instanceof AppError && error.details ? error.details : {})
  };
  const technicalMessage = emailFailureMessage(details);

  return new AppError(
    publicEmailFailureMessage(purpose),
    error?.statusCode || 502,
    "EMAIL_SEND_FAILED",
    {
      ...details,
      purpose,
      technicalMessage
    }
  );
}

async function createSmtpTransporter() {
  if (hasPlaceholderSmtpPassword()) {
    throw new AppError(
      "Could not send email. Please try again later.",
      503,
      "EMAIL_SMTP_APP_PASSWORD_REQUIRED",
      {
        provider: "smtp",
        providerMessage: "SMTP_PASS is still set to GMAIL_APP_PASSWORD. Replace it with a real Gmail App Password.",
        hint: "Create a Gmail App Password for supportbluemindai@gmail.com and set SMTP_PASS to that 16-character app password."
      }
    );
  }

  let lastError;

  for (const options of smtpConnectionCandidates()) {
    const transporter = nodemailer.createTransport(options);

    try {
      await withEmailTimeout(transporter.verify());
      logger.info({
        provider: "smtp",
        host: options.host,
        port: options.port,
        secure: options.secure,
        from: env.EMAIL_FROM
      }, "SMTP connected");

      return transporter;
    } catch (error) {
      lastError = error;
      transporter.close?.();
      logger.warn({
        err: error,
        provider: "smtp",
        host: options.host,
        port: options.port,
        secure: options.secure
      }, "SMTP connection attempt failed");
    }
  }

  throw lastError;
}

async function getSmtpTransporter() {
  if (!smtpTransporterPromise) {
    smtpTransporterPromise = createSmtpTransporter().catch((error) => {
      smtpTransporterPromise = undefined;
      throw error;
    });
  }

  return smtpTransporterPromise;
}

async function sendWithSmtp({ to, subject, text, html, attachments }) {
  try {
    const transporter = await getSmtpTransporter();
    return await withEmailTimeout(transporter.sendMail({
      from: env.EMAIL_FROM,
      to,
      subject,
      text,
      html,
      attachments
    }));
  } catch (error) {
    smtpTransporterPromise = undefined;
    throw error;
  }
}

async function sendWithResend({ to, subject, text, html, attachments }) {
  if (!env.RESEND_API_KEY) {
    throw new AppError("Email provider is not configured", 503, "EMAIL_PROVIDER_NOT_CONFIGURED", {
      provider: "resend",
      missing: ["RESEND_API_KEY"]
    });
  }

  const response = await withEmailTimeout(fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      text,
      html,
      attachments
    })
  }));

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new AppError("Email provider rejected the message", 502, "EMAIL_SEND_FAILED", {
      provider: "resend",
      providerStatus: response.status,
      providerMessage: payload?.message || payload?.error || "Resend rejected the email",
      providerResponse: payload
    });
    throw error;
  }

  return payload;
}

async function sendWithRetry(operation, context) {
  const maxAttempts = env.EMAIL_SEND_RETRIES + 1;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await operation();
      logger.info({
        to: context.to,
        purpose: context.purpose,
        provider: context.provider,
        attempt,
        messageId: result?.messageId || result?.id,
        accepted: result?.accepted,
        rejected: result?.rejected
      }, "Email send success");
      return result;
    } catch (error) {
      const details = emailProviderDetails(error, context.provider);
      const isFinalAttempt = attempt >= maxAttempts;
      const shouldStop = isNonRetryableEmailError(error);
      logger[isFinalAttempt ? "error" : "warn"]({
        err: error,
        to: context.to,
        purpose: context.purpose,
        provider: context.provider,
        attempt,
        maxAttempts,
        details
      }, isFinalAttempt || shouldStop ? "Email send failed" : "Email send failed; retrying");

      if (isFinalAttempt || shouldStop) {
        throw toEmailSendError(error, context.provider, context.purpose);
      }

      await wait(env.EMAIL_SEND_RETRY_DELAY_MS * attempt);
    }
  }

  throw new AppError("Could not send email. Please try again later.", 502, "EMAIL_SEND_FAILED");
}

async function sendEmail({ to, subject, text, html, attachments, auditCode, purpose }) {
  if (env.EMAIL_PROVIDER === "smtp") {
    return sendWithRetry(
      () => sendWithSmtp({ to, subject, text, html, attachments }),
      { to, purpose, provider: "smtp" }
    );
  }

  if (env.EMAIL_PROVIDER === "resend") {
    return sendWithRetry(
      () => sendWithResend({ to, subject, text, html, attachments }),
      { to, purpose, provider: "resend" }
    );
  }

  if (env.NODE_ENV === "production" && !env.EMAIL_DEV_MODE) {
    throw new AppError("Email provider is not configured", 503, "EMAIL_PROVIDER_NOT_CONFIGURED");
  }

  logger.warn({
    to,
    subject,
    purpose,
    devCode: auditCode
  }, "Email dev delivery: configure EMAIL_PROVIDER=smtp or EMAIL_PROVIDER=resend for real delivery");

  return { id: `dev-${Date.now()}`, devOnly: true };
}

export function sendVerificationEmail({ to, name, code }) {
  const subject = "Verify your BlueMind AI email";
  const intro = `Hi ${name || "there"}, use this secure code to verify your BlueMind AI account.`;
  const outro = "This code expires in 10 minutes. If you did not create this account, you can safely ignore this email.";
  const actionUrl = publicFrontendUrl(`/auth/verify-email?email=${encodeURIComponent(to)}`);

  return sendEmail({
    to,
    subject,
    purpose: "email_verification",
    auditCode: code,
    text: `${intro}\n\nCode: ${code}\n\nOpen: ${actionUrl}\n\n${outro}`,
    html: buildHtml({
      title: "Verify your email",
      intro,
      code,
      outro,
      actionLabel: "Open verification page",
      actionUrl
    })
  });
}

export function sendPasswordResetEmail({ to, name, code }) {
  const subject = "Reset your BlueMind AI password";
  const intro = `Hi ${name || "there"}, use this secure code to reset your BlueMind AI password.`;
  const outro = "This code expires soon. If you did not request a password reset, you can safely ignore this email.";
  const actionUrl = publicFrontendUrl(`/auth/reset-password?email=${encodeURIComponent(to)}`);

  return sendEmail({
    to,
    subject,
    purpose: "password_reset",
    auditCode: code,
    text: `${intro}\n\nCode: ${code}\n\nOpen: ${actionUrl}\n\n${outro}`,
    html: buildHtml({
      title: "Reset your password",
      intro,
      code,
      outro,
      actionLabel: "Reset password",
      actionUrl
    })
  });
}

export function sendEmailChangeVerification({ to, name, code }) {
  const subject = "Confirm your new BlueMind AI email";
  const intro = `Hi ${name || "there"}, use this secure code to confirm this new email address for BlueMind AI.`;
  const outro = "This code expires in 10 minutes. Your email will not change until you confirm it.";

  return sendEmail({
    to,
    subject,
    purpose: "email_change",
    auditCode: code,
    text: `${intro}\n\nCode: ${code}\n\n${outro}`,
    html: buildHtml({
      title: "Confirm new email",
      intro,
      code,
      outro
    })
  });
}

export function sendSupportIssueReport({ user, title, description, platform, appVersion, timestamp, attachments = [] }) {
  const accountEmail = user?.email || "Unknown";
  const subject = `[BlueMind Issue] ${title}`;
  const text = [
    "BlueMind AI issue report",
    "",
    `Title: ${title}`,
    `Account email: ${accountEmail}`,
    `Timestamp: ${timestamp}`,
    `App version: ${appVersion}`,
    `Platform: ${platform}`,
    "",
    "Description:",
    description
  ].join("\n");

  return sendEmail({
    to: "supportbluemindai@gmail.com",
    subject,
    purpose: "support_issue_report",
    auditCode: title,
    text,
    html: buildSupportIssueHtml({
      title,
      description,
      accountEmail,
      timestamp,
      appVersion,
      platform
    }),
    attachments
  });
}
