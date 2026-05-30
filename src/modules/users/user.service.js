import { User } from "./user.model.js";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function findUserByEmail(email) {
  return User.findOne({ email: normalizeEmail(email) });
}

export function findUserByGoogleId(googleId) {
  return User.findOne({ googleId });
}

export function findUserById(userId) {
  return User.findById(userId);
}

export function createUser(data) {
  return User.create({
    ...data,
    email: normalizeEmail(data.email)
  });
}

export async function updateLastLogin(user) {
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}

export async function linkGoogleIdentity(user, profile) {
  user.googleId = profile.googleId;
  user.emailVerified = Boolean(profile.emailVerified);
  user.avatarUrl = profile.avatarUrl || user.avatarUrl || "";
  user.authProvider = user.passwordHash ? "mixed" : "google";
  user.lastLoginAt = new Date();
  await user.save();
  return user;
}
