import jwt from "jsonwebtoken";

import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import { comparePassword, hashPassword } from "../auth/password.service.js";
import {
  createChatReply,
  createStreamingChatReply,
  deleteChatConversation,
  getChatConversation,
  listChatConversations,
  renameChatConversation
} from "../chat/chat.service.js";
import { PrivateSpace } from "./privateSpace.model.js";
import { Conversation } from "../memory/conversation.model.js";

const PRIVATE_SPACE_ACCESS_TTL = "30m";
const MAX_PRIVATE_SPACES = 5;

function toPrivateSpaceResponse(space) {
  return {
    privateSpaceId: space._id.toString(),
    userId: space.userId.toString(),
    name: space.name,
    createdAt: space.createdAt,
    updatedAt: space.updatedAt
  };
}

async function findOwnedPrivateSpace(userId, privateSpaceId, options = {}) {
  const query = PrivateSpace.findOne({
    _id: privateSpaceId,
    userId,
    deletedAt: { $exists: false }
  });

  if (options.includePin) {
    query.select("+hashedPin");
  }

  const space = await query;

  if (!space) {
    throw new AppError("Private space was not found", 404, "PRIVATE_SPACE_NOT_FOUND");
  }

  return space;
}

export async function createPrivateSpace({ userId, name, pin }) {
  const count = await PrivateSpace.countDocuments({
    userId,
    deletedAt: { $exists: false }
  });

  if (count >= MAX_PRIVATE_SPACES) {
    throw new AppError("Maximum private chats reached. Delete one before creating another.", 400, "PRIVATE_SPACE_LIMIT_REACHED");
  }

  const created = await PrivateSpace.create({
    userId,
    name,
    hashedPin: await hashPassword(pin)
  });

  return {
    privateSpace: toPrivateSpaceResponse(created)
  };
}

export async function renamePrivateSpace({ userId, privateSpaceId, name }) {
  const space = await findOwnedPrivateSpace(userId, privateSpaceId);
  space.name = name;
  await space.save();

  return {
    privateSpace: toPrivateSpaceResponse(space)
  };
}

export async function changePrivateSpacePin({ userId, privateSpaceId, currentPin, newPin }) {
  const space = await findOwnedPrivateSpace(userId, privateSpaceId, { includePin: true });
  const isValid = await comparePassword(currentPin, space.hashedPin);

  if (!isValid) {
    throw new AppError("Incorrect PIN. Try again.", 401, "PRIVATE_SPACE_PIN_INVALID");
  }

  space.hashedPin = await hashPassword(newPin);
  await space.save();

  return {
    privateSpace: toPrivateSpaceResponse(space)
  };
}

export async function deletePrivateSpace({ userId, privateSpaceId }) {
  const space = await findOwnedPrivateSpace(userId, privateSpaceId);
  const now = new Date();
  space.deletedAt = now;
  await space.save();

  await Conversation.updateMany({
    userId,
    privateSpaceId,
    deletedAt: { $exists: false }
  }, {
    $set: { deletedAt: now }
  });

  return {
    deleted: true,
    privateSpaceId
  };
}

export async function listPrivateSpaces(userId) {
  const spaces = await PrivateSpace.find({
    userId,
    deletedAt: { $exists: false }
  }).sort({ updatedAt: -1 });

  return {
    items: spaces.map(toPrivateSpaceResponse)
  };
}

export async function unlockPrivateSpace({ userId, privateSpaceId, pin }) {
  const space = await findOwnedPrivateSpace(userId, privateSpaceId, { includePin: true });
  const isValid = await comparePassword(pin, space.hashedPin);

  if (!isValid) {
    throw new AppError("Incorrect PIN. Try again.", 401, "PRIVATE_SPACE_PIN_INVALID");
  }

  const accessToken = jwt.sign({
    sub: userId.toString(),
    privateSpaceId: space._id.toString(),
    type: "private_space_access"
  }, env.JWT_SECRET, {
    expiresIn: PRIVATE_SPACE_ACCESS_TTL
  });

  return {
    privateSpace: toPrivateSpaceResponse(space),
    accessToken,
    expiresIn: PRIVATE_SPACE_ACCESS_TTL
  };
}

export async function assertPrivateSpaceAccess({ userId, privateSpaceId, accessToken }) {
  if (!accessToken) {
    throw new AppError("Unlock this private space first", 401, "PRIVATE_SPACE_LOCKED");
  }

  let payload;
  try {
    payload = jwt.verify(accessToken, env.JWT_SECRET);
  } catch {
    throw new AppError("Private space is locked. Enter your PIN again.", 401, "PRIVATE_SPACE_ACCESS_INVALID");
  }

  if (
    payload.type !== "private_space_access" ||
    payload.sub !== userId.toString() ||
    payload.privateSpaceId !== privateSpaceId.toString()
  ) {
    throw new AppError("Private space is locked. Enter your PIN again.", 401, "PRIVATE_SPACE_ACCESS_INVALID");
  }

  await findOwnedPrivateSpace(userId, privateSpaceId);
}

export async function listPrivateSpaceChats({ userId, privateSpaceId, accessToken }) {
  await assertPrivateSpaceAccess({ userId, privateSpaceId, accessToken });
  return listChatConversations(userId, { privateSpaceId });
}

export async function createPrivateSpaceChat({ userId, privateSpaceId, accessToken }) {
  await assertPrivateSpaceAccess({ userId, privateSpaceId, accessToken });
  return {
    conversation: {
      privateSpaceId,
      title: "New conversation",
      messages: []
    }
  };
}

export async function getPrivateSpaceChat({ userId, privateSpaceId, conversationId, accessToken }) {
  await assertPrivateSpaceAccess({ userId, privateSpaceId, accessToken });
  return getChatConversation(userId, conversationId, { privateSpaceId });
}

export async function renamePrivateSpaceChat({ userId, privateSpaceId, conversationId, title, accessToken }) {
  await assertPrivateSpaceAccess({ userId, privateSpaceId, accessToken });
  return renameChatConversation(userId, conversationId, title, { privateSpaceId });
}

export async function deletePrivateSpaceChat({ userId, privateSpaceId, conversationId, accessToken }) {
  await assertPrivateSpaceAccess({ userId, privateSpaceId, accessToken });
  return deleteChatConversation(userId, conversationId, { privateSpaceId });
}

export async function sendPrivateSpaceMessage({ userId, privateSpaceId, accessToken, payload }) {
  await assertPrivateSpaceAccess({ userId, privateSpaceId, accessToken });
  return createChatReply({
    userId,
    privateSpaceId,
    ...payload
  });
}

export async function streamPrivateSpaceMessage({ userId, privateSpaceId, accessToken, payload }) {
  await assertPrivateSpaceAccess({ userId, privateSpaceId, accessToken });
  return createStreamingChatReply({
    userId,
    privateSpaceId,
    ...payload
  });
}
