import { upsertUserMemory } from "../memory/memory.repository.js";
import {
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  linkGoogleIdentity,
  updateLastLogin
} from "../users/user.service.js";
import { createAuthSession } from "./session.service.js";
import { verifyFirebaseIdToken } from "./firebase-auth.service.js";

async function saveGoogleIdentityMemory(user) {
  await upsertUserMemory(user._id, {
    type: "profile",
    key: "profile:identity",
    content: `The user's name is ${user.name}. Their email is ${user.email}. They signed in with ${user.authProvider}.`,
    tags: ["identity", "profile", "google"],
    importance: 0.95,
    confidence: 0.95,
    pinned: true,
    source: {
      kind: "manual"
    },
    metadata: {
      userId: user._id.toString(),
      provider: user.authProvider,
      googleLinked: Boolean(user.googleId),
      lastLoginAt: user.lastLoginAt
    }
  });
}

export async function loginWithFirebaseGoogleToken({ idToken, req }) {
  const profile = await verifyFirebaseIdToken(idToken);
  return loginWithGoogleProfile({ profile, req });
}

async function loginWithGoogleProfile({ profile, req }) {
  let user = await findUserByGoogleId(profile.googleId);

  if (!user) {
    user = await findUserByEmail(profile.email);
  }

  if (user) {
    if (user.googleId !== profile.googleId) {
      user = await linkGoogleIdentity(user, profile);
    } else {
      user.name = user.name || profile.name;
      user.avatarUrl = profile.avatarUrl || user.avatarUrl || "";
      user.emailVerified = true;
      user = await updateLastLogin(user);
    }
  } else {
    user = await createUser({
      name: profile.name,
      email: profile.email,
      passwordHash: "",
      authProvider: "google",
      googleId: profile.googleId,
      avatarUrl: profile.avatarUrl,
      emailVerified: true,
      lastLoginAt: new Date()
    });
  }

  await saveGoogleIdentityMemory(user);

  return createAuthSession(user, req);
}
