import { randomUUID } from "node:crypto";

import { env } from "../../config/env.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { setupSse, writeSse, writeSseComment } from "../../utils/sse.js";
import {
  createPrivateSpace,
  createPrivateSpaceChat,
  deletePrivateSpaceChat,
  getPrivateSpaceChat,
  listPrivateSpaceChats,
  listPrivateSpaces,
  sendPrivateSpaceMessage,
  streamPrivateSpaceMessage,
  renamePrivateSpaceChat,
  unlockPrivateSpace
} from "./privateSpace.service.js";

function readPrivateAccessToken(req) {
  return req.get("x-private-space-token") || req.body?.privateSpaceAccessToken || "";
}

export const createSpace = asyncHandler(async (req, res) => {
  const result = await createPrivateSpace({
    userId: req.user._id,
    name: req.validated.body.name,
    pin: req.validated.body.pin
  });

  sendResponse(res, 201, result, "Private space created");
});

export const listSpaces = asyncHandler(async (req, res) => {
  sendResponse(res, 200, await listPrivateSpaces(req.user._id));
});

export const unlockSpace = asyncHandler(async (req, res) => {
  const result = await unlockPrivateSpace({
    userId: req.user._id,
    privateSpaceId: req.validated.params.id,
    pin: req.validated.body.pin
  });

  sendResponse(res, 200, result, "Private space unlocked");
});

export const listSpaceChats = asyncHandler(async (req, res) => {
  const result = await listPrivateSpaceChats({
    userId: req.user._id,
    privateSpaceId: req.validated.params.id,
    accessToken: readPrivateAccessToken(req)
  });

  sendResponse(res, 200, result);
});

export const createSpaceChat = asyncHandler(async (req, res) => {
  const result = await createPrivateSpaceChat({
    userId: req.user._id,
    privateSpaceId: req.validated.params.id,
    accessToken: readPrivateAccessToken(req)
  });

  sendResponse(res, 201, result, "Private chat created");
});

export const getSpaceChat = asyncHandler(async (req, res) => {
  const result = await getPrivateSpaceChat({
    userId: req.user._id,
    privateSpaceId: req.validated.params.id,
    conversationId: req.validated.params.conversationId,
    accessToken: readPrivateAccessToken(req)
  });

  sendResponse(res, 200, result);
});

export const renameSpaceChat = asyncHandler(async (req, res) => {
  const result = await renamePrivateSpaceChat({
    userId: req.user._id,
    privateSpaceId: req.validated.params.id,
    conversationId: req.validated.params.conversationId,
    title: req.validated.body.title,
    accessToken: readPrivateAccessToken(req)
  });

  sendResponse(res, 200, result, "Conversation renamed");
});

export const deleteSpaceChat = asyncHandler(async (req, res) => {
  const result = await deletePrivateSpaceChat({
    userId: req.user._id,
    privateSpaceId: req.validated.params.id,
    conversationId: req.validated.params.conversationId,
    accessToken: readPrivateAccessToken(req)
  });

  sendResponse(res, 200, result, "Conversation deleted");
});

export const sendSpaceMessage = asyncHandler(async (req, res) => {
  const result = await sendPrivateSpaceMessage({
    userId: req.user._id,
    privateSpaceId: req.validated.params.id,
    accessToken: readPrivateAccessToken(req),
    payload: req.validated.body
  });

  sendResponse(res, 200, result);
});

function toStreamErrorPayload(error, streamId) {
  const statusCode = error.statusCode || 500;
  const isServerError = statusCode >= 500;
  const message = env.NODE_ENV === "production" && isServerError
    ? "Internal server error"
    : error.message;

  return {
    streamId,
    code: error.code || "STREAM_ERROR",
    message: message || "Streaming failed",
    details: error.details
  };
}

export async function streamSpaceMessage(req, res, next) {
  const streamId = randomUUID();
  const startedAt = Date.now();
  const abortController = new AbortController();
  let clientClosed = false;
  let heartbeat;

  function abortOnClose() {
    if (!res.writableEnded) {
      clientClosed = true;
      abortController.abort();
      req.log.info({ streamId }, "Private space stream client disconnected");
    }
  }

  req.on("close", abortOnClose);

  try {
    setupSse(res);
    await writeSseComment(res, "BlueMind AI private space streaming chat");
    await writeSse(res, "connected", {
      streamId,
      mode: "sse"
    });

    heartbeat = setInterval(() => {
      void writeSse(res, "heartbeat", {
        streamId,
        timestamp: new Date().toISOString()
      });
    }, 15000);
    heartbeat.unref?.();

    const result = await streamPrivateSpaceMessage({
      userId: req.user._id,
      privateSpaceId: req.validated.params.id,
      accessToken: readPrivateAccessToken(req),
      payload: {
        ...req.validated.body,
        signal: abortController.signal,
        onStart: async (conversation) => {
          const written = await writeSse(res, "ready", { streamId, conversation });
          if (!written) abortController.abort();
        },
        onResponseStart: async (ai) => {
          const written = await writeSse(res, "ai_start", { streamId, ai });
          if (!written) abortController.abort();
        },
        onDelta: async ({ token, index, sequenceNumber }) => {
          const written = await writeSse(res, "delta", {
            streamId,
            token,
            index,
            sequenceNumber
          }, {
            id: `${streamId}:${index}`
          });
          if (!written) abortController.abort();
        }
      }
    });

    await writeSse(res, "complete", { streamId, ...result });
    await writeSse(res, "done", { streamId });
    res.end();

    req.log.info({
      streamId,
      privateSpaceId: req.validated.params.id,
      conversationId: result.conversation.conversationId,
      durationMs: Date.now() - startedAt
    }, "Private space streaming chat completed");
  } catch (error) {
    if (clientClosed || error.code === "AI_STREAM_ABORTED") {
      req.log.info({ streamId, durationMs: Date.now() - startedAt }, "Private space stream aborted");
      return;
    }

    if (!res.headersSent) {
      next(error);
      return;
    }

    req.log.error({ streamId, err: error, durationMs: Date.now() - startedAt }, "Private space stream failed");
    await writeSse(res, "error", toStreamErrorPayload(error, streamId));
    await writeSse(res, "done", { streamId });
    res.end();
  } finally {
    clearInterval(heartbeat);
    req.off("close", abortOnClose);
  }
}
