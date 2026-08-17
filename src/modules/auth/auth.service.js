import crypto from "node:crypto";

import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import {
  sendEmailChangeVerification,
  sendPasswordResetEmail,
  sendVerificationEmail
} from "../email/email.service.js";
import { upsertUserMemory } from "../memory/memory.repository.js";
import { updateUserPreferences as updatePreferencesForUser } from "../preferences/preferences.service.js";
import { createUser, findUserByEmail, normalizeEmail, updateLastLogin } from "../users/user.service.js";
import { processDueAccountDeletions } from "./accountDeletion.service.js";
import { comparePassword, hashPassword } from "./password.service.js";
import { createAuthSession, refreshAuthSession, revokeAuthSession, revokeUserSessions } from "./session.service.js";
import { hashToken } from "./token.service.js";

function now() {
  return new Date();
}

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function secondsUntil(date) {
  if (!date) return 0;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 1000));
}

function generateCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function assertCooldown(lastSentAt, action) {
  if (!lastSentAt) return;

  const retryAt = new Date(lastSentAt.getTime() + env.AUTH_CODE_RESEND_COOLDOWN_SECONDS * 1000);

  if (retryAt > now()) {
    throw new AppError("Please wait before requesting another code", 429, "AUTH_CODE_RESEND_COOLDOWN", {
      action,
      retryAfterSeconds: secondsUntil(retryAt)
    });
  }
}

function assertCodeAttempts(user, field, action) {
  if ((user[field] || 0) >= env.AUTH_CODE_MAX_ATTEMPTS) {
    throw new AppError("Too many invalid code attempts. Request a new code.", 429, "AUTH_CODE_MAX_ATTEMPTS", {
      action,
      maxAttempts: env.AUTH_CODE_MAX_ATTEMPTS
    });
  }
}

function verifyCodeOrThrow({ user, code, hashField, expiresField, attemptsField, action }) {
  if (!user[hashField] || !user[expiresField]) {
    throw new AppError("Verification code was not found", 400, "AUTH_CODE_NOT_FOUND", { action });
  }

  if (user[expiresField] <= now()) {
    throw new AppError("Verification code has expired", 400, "AUTH_CODE_EXPIRED", { action });
  }

  assertCodeAttempts(user, attemptsField, action);

  if (user[hashField] !== hashToken(String(code).trim())) {
    user[attemptsField] = (user[attemptsField] || 0) + 1;
    return false;
  }

  return true;
}

function clearEmailVerification(user) {
  user.emailVerificationCodeHash = "";
  user.emailVerificationExpiresAt = undefined;
  user.emailVerificationAttempts = 0;
  user.emailVerificationLastSentAt = undefined;
}

function clearPasswordReset(user) {
  user.passwordResetCodeHash = "";
  user.passwordResetExpiresAt = undefined;
  user.passwordResetAttempts = 0;
  user.passwordResetLastSentAt = undefined;
  user.passwordResetResendAttempts = 0;
  user.passwordResetResendCooldownUntil = undefined;
  user.passwordResetSessionHash = "";
  user.passwordResetSessionExpiresAt = undefined;
}

function clearPendingEmail(user) {
  user.pendingEmail = "";
  user.pendingEmailCodeHash = "";
  user.pendingEmailExpiresAt = undefined;
  user.pendingEmailAttempts = 0;
  user.pendingEmailLastSentAt = undefined;
}

function emailVerificationMeta(user) {
  return {
    required: true,
    email: user.email,
    expiresAt: user.emailVerificationExpiresAt,
    resendAvailableInSeconds: secondsUntil(
      user.emailVerificationLastSentAt
        ? new Date(user.emailVerificationLastSentAt.getTime() + env.AUTH_CODE_RESEND_COOLDOWN_SECONDS * 1000)
        : undefined
    )
  };
}

function passwordResetMeta(user) {
  const resendRetryAt = user?.passwordResetLastSentAt
    ? new Date(user.passwordResetLastSentAt.getTime() + env.AUTH_CODE_RESEND_COOLDOWN_SECONDS * 1000)
    : undefined;
  const cooldownUntil = user?.passwordResetResendCooldownUntil;

  return {
    email: user?.email,
    expiresAt: user?.passwordResetExpiresAt,
    resendAvailableInSeconds: Math.max(secondsUntil(resendRetryAt), secondsUntil(cooldownUntil)),
    resendAttempts: user?.passwordResetResendAttempts || 0,
    maxResendAttempts: env.PASSWORD_RESET_MAX_RESEND_ATTEMPTS,
    lockedUntil: cooldownUntil,
    lockedForSeconds: secondsUntil(cooldownUntil)
  };
}

function genericPasswordResetMeta() {
  return {
    resendAvailableInSeconds: env.AUTH_CODE_RESEND_COOLDOWN_SECONDS,
    resendAttempts: 0,
    maxResendAttempts: env.PASSWORD_RESET_MAX_RESEND_ATTEMPTS
  };
}

function passwordResetLockUntil() {
  return minutesFromNow(env.PASSWORD_RESET_RESEND_LOCK_MINUTES);
}

function assertPasswordResetResendAllowed(user) {
  if (user.passwordResetResendCooldownUntil && user.passwordResetResendCooldownUntil > now()) {
    throw new AppError("Too many attempts. Please try again in one hour.", 429, "PASSWORD_RESET_RESEND_LOCKED", {
      retryAfterSeconds: secondsUntil(user.passwordResetResendCooldownUntil),
      maxResendAttempts: env.PASSWORD_RESET_MAX_RESEND_ATTEMPTS
    });
  }

  if (user.passwordResetResendCooldownUntil && user.passwordResetResendCooldownUntil <= now()) {
    user.passwordResetResendCooldownUntil = undefined;
    user.passwordResetResendAttempts = 0;
  }
}

async function saveIdentityMemory(user) {
  await upsertUserMemory(user._id, {
    type: "profile",
    key: "profile:identity",
    content: `The user's name is ${user.name}. Their email is ${user.email}. They signed in with ${user.authProvider}.`,
    tags: ["identity", "profile", user.authProvider],
    importance: 0.95,
    confidence: user.emailVerified ? 0.95 : 0.8,
    pinned: true,
    source: {
      kind: "manual"
    },
    metadata: {
      userId: user._id.toString(),
      provider: user.authProvider,
      lastLoginAt: user.lastLoginAt
    }
  });
}

async function issueEmailVerification(user, { bypassCooldown = false } = {}) {
  if (user.emailVerified) {
    return emailVerificationMeta(user);
  }

  if (!bypassCooldown) {
    assertCooldown(user.emailVerificationLastSentAt, "email_verification");
  }

  const code = generateCode();

  user.emailVerificationCodeHash = hashToken(code);
  user.emailVerificationExpiresAt = minutesFromNow(env.EMAIL_VERIFICATION_CODE_TTL_MINUTES);
  user.emailVerificationAttempts = 0;
  user.emailVerificationLastSentAt = undefined;
  await user.save();

  let delivery;

  try {
    delivery = await sendVerificationEmail({
      to: user.email,
      name: user.name,
      code
    });
  } catch (error) {
    clearEmailVerification(user);
    await user.save().catch(() => {});
    throw error;
  }

  if (!delivery?.devOnly) {
    user.emailVerificationLastSentAt = now();
    await user.save();
  }

  return emailVerificationMeta(user);
}

export async function registerUser({ name, email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new AppError("Email is already registered", 409, "EMAIL_ALREADY_REGISTERED");
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    authProvider: "local",
    emailVerified: false
  });

  let verification;

  try {
    verification = await issueEmailVerification(user, { bypassCooldown: true });
  } catch (error) {
    await user.deleteOne().catch(() => {});
    throw error;
  }

  await saveIdentityMemory(user);

  return {
    user: user.toSafeObject(),
    verification
  };
}

export async function loginUser({ email, password }, req) {
  await processDueAccountDeletions();

  const user = await findUserByEmail(email);

  if (!user || !user.passwordHash) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  const passwordMatches = await comparePassword(password, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }

  await updateLastLogin(user);
  await saveIdentityMemory(user);

  return createAuthSession(user, req);
}

export async function loginGuest(req) {
  const guestId = crypto.randomUUID();
  const user = await createUser({
    name: "BlueMind Guest",
    email: `guest-${guestId}@guest.bluemind.local`,
    authProvider: "guest",
    emailVerified: true
  });

  await updateLastLogin(user);
  return createAuthSession(user, req);
}

export async function verifyEmail({ email, code }, req) {
  const user = await findUserByEmail(email);

  if (!user) {
    throw new AppError("Invalid verification code", 400, "AUTH_CODE_INVALID");
  }

  if (!user.emailVerified) {
    const valid = verifyCodeOrThrow({
      user,
      code,
      hashField: "emailVerificationCodeHash",
      expiresField: "emailVerificationExpiresAt",
      attemptsField: "emailVerificationAttempts",
      action: "email_verification"
    });

    if (!valid) {
      await user.save();
      throw new AppError("Invalid verification code", 400, "AUTH_CODE_INVALID", {
        attemptsRemaining: Math.max(0, env.AUTH_CODE_MAX_ATTEMPTS - user.emailVerificationAttempts)
      });
    }

    user.emailVerified = true;
    clearEmailVerification(user);
  }

  await updateLastLogin(user);
  await user.save();
  await saveIdentityMemory(user);

  return createAuthSession(user, req);
}

export async function resendEmailVerification({ email }) {
  const user = await findUserByEmail(email);

  if (!user) {
    return { sent: true };
  }

  if (user.emailVerified) {
    return {
      sent: false,
      alreadyVerified: true
    };
  }

  const verification = await issueEmailVerification(user);

  return {
    sent: true,
    verification
  };
}

export async function requestPasswordReset({ email }) {
  const user = await findUserByEmail(email);

  if (!user || !user.passwordHash) {
    return {
      sent: true,
      reset: genericPasswordResetMeta()
    };
  }

  assertPasswordResetResendAllowed(user);
  assertCooldown(user.passwordResetLastSentAt, "password_reset");

  const hasActiveReset = Boolean(
    user.passwordResetCodeHash &&
    user.passwordResetExpiresAt &&
    user.passwordResetExpiresAt > now()
  );
  const resendAttempts = hasActiveReset ? (user.passwordResetResendAttempts || 0) + 1 : 0;

  if (resendAttempts > env.PASSWORD_RESET_MAX_RESEND_ATTEMPTS) {
    user.passwordResetResendCooldownUntil = passwordResetLockUntil();
    await user.save();
    throw new AppError("Too many attempts. Please try again in one hour.", 429, "PASSWORD_RESET_RESEND_LOCKED", {
      retryAfterSeconds: secondsUntil(user.passwordResetResendCooldownUntil),
      maxResendAttempts: env.PASSWORD_RESET_MAX_RESEND_ATTEMPTS
    });
  }

  const code = generateCode();

  user.passwordResetCodeHash = hashToken(code);
  user.passwordResetExpiresAt = minutesFromNow(env.PASSWORD_RESET_CODE_TTL_MINUTES);
  user.passwordResetAttempts = 0;
  user.passwordResetLastSentAt = undefined;
  user.passwordResetResendAttempts = resendAttempts;
  user.passwordResetSessionHash = "";
  user.passwordResetSessionExpiresAt = undefined;

  if (resendAttempts >= env.PASSWORD_RESET_MAX_RESEND_ATTEMPTS) {
    user.passwordResetResendCooldownUntil = passwordResetLockUntil();
  } else {
    user.passwordResetResendCooldownUntil = undefined;
  }

  await user.save();

  let delivery;

  try {
    delivery = await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      code
    });
  } catch (error) {
    clearPasswordReset(user);
    await user.save().catch(() => {});
    throw error;
  }

  if (!delivery?.devOnly) {
    user.passwordResetLastSentAt = now();
    await user.save();
  }

  return {
    sent: true,
    expiresAt: user.passwordResetExpiresAt,
    reset: passwordResetMeta(user)
  };
}

export async function verifyPasswordResetCode({ email, code }) {
  const user = await findUserByEmail(email);

  if (!user || !user.passwordHash) {
    throw new AppError("Invalid or expired reset code", 400, "PASSWORD_RESET_INVALID");
  }

  const valid = verifyCodeOrThrow({
    user,
    code,
    hashField: "passwordResetCodeHash",
    expiresField: "passwordResetExpiresAt",
    attemptsField: "passwordResetAttempts",
    action: "password_reset"
  });

  if (!valid) {
    await user.save();
    throw new AppError("Invalid or expired reset code", 400, "PASSWORD_RESET_INVALID", {
      attemptsRemaining: Math.max(0, env.AUTH_CODE_MAX_ATTEMPTS - user.passwordResetAttempts)
    });
  }

  const resetToken = crypto.randomBytes(32).toString("base64url");
  const sessionExpiresAt = new Date(Math.min(
    user.passwordResetExpiresAt.getTime(),
    minutesFromNow(env.PASSWORD_RESET_SESSION_TTL_MINUTES).getTime()
  ));

  user.passwordResetSessionHash = hashToken(resetToken);
  user.passwordResetSessionExpiresAt = sessionExpiresAt;
  user.passwordResetCodeHash = "";
  user.passwordResetAttempts = 0;
  await user.save();

  return {
    verified: true,
    resetToken,
    expiresAt: sessionExpiresAt
  };
}

function verifyPasswordResetSessionOrThrow(user, resetToken) {
  if (!user.passwordResetSessionHash || !user.passwordResetSessionExpiresAt) {
    throw new AppError("Invalid or expired reset session", 400, "PASSWORD_RESET_INVALID");
  }

  if (user.passwordResetSessionExpiresAt <= now()) {
    throw new AppError("Invalid or expired reset session", 400, "PASSWORD_RESET_INVALID");
  }

  if (user.passwordResetSessionHash !== hashToken(String(resetToken).trim())) {
    throw new AppError("Invalid or expired reset session", 400, "PASSWORD_RESET_INVALID");
  }
}

export async function resetPassword({ email, code, resetToken, password }) {
  const user = await findUserByEmail(email);

  if (!user || !user.passwordHash) {
    throw new AppError("Invalid or expired reset code", 400, "PASSWORD_RESET_INVALID");
  }

  if (resetToken) {
    verifyPasswordResetSessionOrThrow(user, resetToken);
  } else {
    const valid = verifyCodeOrThrow({
      user,
      code,
      hashField: "passwordResetCodeHash",
      expiresField: "passwordResetExpiresAt",
      attemptsField: "passwordResetAttempts",
      action: "password_reset"
    });

    if (!valid) {
      await user.save();
      throw new AppError("Invalid or expired reset code", 400, "PASSWORD_RESET_INVALID", {
        attemptsRemaining: Math.max(0, env.AUTH_CODE_MAX_ATTEMPTS - user.passwordResetAttempts)
      });
    }
  }

  user.passwordHash = await hashPassword(password);
  user.passwordChangedAt = now();
  clearPasswordReset(user);
  await user.save();
  await revokeUserSessions(user._id, "password_reset");

  return { reset: true };
}

export async function requestEmailChange(user, { currentPassword, newEmail }) {
  if (!user.passwordHash) {
    throw new AppError("Password login is required to change email", 400, "PASSWORD_LOGIN_REQUIRED");
  }

  const passwordMatches = await comparePassword(currentPassword, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError("Current password is incorrect", 401, "CURRENT_PASSWORD_INVALID");
  }

  const normalizedEmail = normalizeEmail(newEmail);

  if (normalizedEmail === user.email) {
    throw new AppError("New email must be different", 400, "EMAIL_UNCHANGED");
  }

  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new AppError("Email is already registered", 409, "EMAIL_ALREADY_REGISTERED");
  }

  assertCooldown(user.pendingEmailLastSentAt, "email_change");

  const code = generateCode();

  user.pendingEmail = normalizedEmail;
  user.pendingEmailCodeHash = hashToken(code);
  user.pendingEmailExpiresAt = minutesFromNow(env.EMAIL_VERIFICATION_CODE_TTL_MINUTES);
  user.pendingEmailAttempts = 0;
  user.pendingEmailLastSentAt = undefined;
  await user.save();

  let delivery;

  try {
    delivery = await sendEmailChangeVerification({
      to: normalizedEmail,
      name: user.name,
      code
    });
  } catch (error) {
    clearPendingEmail(user);
    await user.save().catch(() => {});
    throw error;
  }

  if (!delivery?.devOnly) {
    user.pendingEmailLastSentAt = now();
    await user.save();
  }

  return {
    pendingEmail: normalizedEmail,
    expiresAt: user.pendingEmailExpiresAt,
    resendAvailableInSeconds: secondsUntil(
      user.pendingEmailLastSentAt
        ? new Date(user.pendingEmailLastSentAt.getTime() + env.AUTH_CODE_RESEND_COOLDOWN_SECONDS * 1000)
        : undefined
    )
  };
}

export async function confirmEmailChange(user, { code }, req) {
  if (!user.pendingEmail) {
    throw new AppError("No pending email change was found", 400, "EMAIL_CHANGE_NOT_PENDING");
  }

  const existingUser = await findUserByEmail(user.pendingEmail);

  if (existingUser && existingUser._id.toString() !== user._id.toString()) {
    clearPendingEmail(user);
    await user.save();
    throw new AppError("Email is already registered", 409, "EMAIL_ALREADY_REGISTERED");
  }

  const valid = verifyCodeOrThrow({
    user,
    code,
    hashField: "pendingEmailCodeHash",
    expiresField: "pendingEmailExpiresAt",
    attemptsField: "pendingEmailAttempts",
    action: "email_change"
  });

  if (!valid) {
    await user.save();
    throw new AppError("Invalid verification code", 400, "AUTH_CODE_INVALID", {
      attemptsRemaining: Math.max(0, env.AUTH_CODE_MAX_ATTEMPTS - user.pendingEmailAttempts)
    });
  }

  user.email = user.pendingEmail;
  user.emailVerified = true;
  clearPendingEmail(user);
  await user.save();
  await saveIdentityMemory(user);
  await revokeUserSessions(user._id, "email_changed", req.authSession?._id);

  return {
    user: user.toSafeObject()
  };
}

export async function changePassword(user, { currentPassword, newPassword }, req) {
  if (!user.passwordHash) {
    throw new AppError("Password login is required to change password", 400, "PASSWORD_LOGIN_REQUIRED");
  }

  const passwordMatches = await comparePassword(currentPassword, user.passwordHash);

  if (!passwordMatches) {
    throw new AppError("Current password is incorrect", 401, "CURRENT_PASSWORD_INVALID");
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = now();
  clearPasswordReset(user);
  await user.save();
  await revokeUserSessions(user._id, "password_changed", req.authSession?._id);

  return {
    user: user.toSafeObject()
  };
}

export async function refreshSession(refreshToken, req) {
  const session = await refreshAuthSession(refreshToken, req);
  await saveIdentityMemory({ ...session.user, _id: session.user.id });
  return session;
}

export async function logoutSession(refreshToken) {
  return revokeAuthSession(refreshToken);
}

export async function updateUserPreferences(user, preferences) {
  const result = await updatePreferencesForUser(user, preferences);
  return result.user;
}
