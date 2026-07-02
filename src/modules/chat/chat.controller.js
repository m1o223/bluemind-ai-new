import { randomUUID } from "node:crypto";

import { env } from "../../config/env.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { setupSse, writeSse, writeSseComment } from "../../utils/sse.js";
import {
  createChatReply,
  createHiddenStreamingChatReply,
  createStreamingChatReply,
  deleteChatConversation,
  getChatConversation,
  getLatestChatConversation,
  listChatConversations,
  renameChatConversation,
  searchChatConversations
} from "./chat.service.js";
import { synthesizeSpeech, transcribeAudio } from "./voice.service.js";

export const sendChatMessage = asyncHandler(async (req, res) => {
  const result = await createChatReply({
    userId: req.user._id,
    ...req.validated.body
  });

  sendResponse(res, 200, result);
});

export const transcribeVoiceMessage = asyncHandler(async (req, res) => {
  const result = await transcribeAudio({
    buffer: req.body,
    contentType: req.headers["content-type"]
  });

  sendResponse(res, 200, result);
});

export const createVoiceSpeech = asyncHandler(async (req, res) => {
  const result = await synthesizeSpeech({
    text: req.body?.text
  });

  res.setHeader("Content-Type", result.contentType);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-BlueMind-Voice-Model", result.model);
  res.setHeader("X-BlueMind-Voice", result.voice);
  res.status(200).send(result.buffer);
});

export const listConversations = asyncHandler(async (req, res) => {
  const result = await listChatConversations(req.user._id);

  sendResponse(res, 200, result);
});

export const searchConversations = asyncHandler(async (req, res) => {
  const result = await searchChatConversations(
    req.user._id,
    req.validated.query.q,
    req.validated.query.limit
  );

  sendResponse(res, 200, result);
});

export const getLatestConversation = asyncHandler(async (req, res) => {
  const result = await getLatestChatConversation(req.user._id);

  sendResponse(res, 200, result);
});

export const getConversation = asyncHandler(async (req, res) => {
  const result = await getChatConversation(
    req.user._id,
    req.validated.params.conversationId
  );

  sendResponse(res, 200, result);
});

export const renameConversation = asyncHandler(async (req, res) => {
  const result = await renameChatConversation(
    req.user._id,
    req.validated.params.conversationId,
    req.validated.body.title
  );

  sendResponse(res, 200, result, "Conversation renamed");
});

export const deleteConversation = asyncHandler(async (req, res) => {
  const result = await deleteChatConversation(
    req.user._id,
    req.validated.params.conversationId
  );

  sendResponse(res, 200, result, "Conversation deleted");
});

function toStreamErrorPayload(error, streamId) {
  const statusCode = error.statusCode || 500;
  const isServerError = statusCode >= 500;
  const message = env.NODE_ENV === "production" && isServerError
    ? "Internal server error"
    : error.message;
  const includeDevDiagnostics = env.NODE_ENV !== "production";

  return {
    streamId,
    statusCode,
    name: includeDevDiagnostics ? error.name : undefined,
    code: error.code || "STREAM_ERROR",
    message: message || "Streaming failed",
    details: error.details,
    stack: includeDevDiagnostics ? error.stack : undefined
  };
}

export async function streamChatMessage(req, res, next) {
  const streamId = randomUUID();
  const startedAt = Date.now();
  const abortController = new AbortController();
  let clientClosed = false;
  let heartbeat;

  function abortOnClose() {
    if (!res.writableEnded) {
      clientClosed = true;
      abortController.abort();
      req.log.info({ streamId }, "Streaming chat client disconnected");
    }
  }

  req.on("close", abortOnClose);

  try {
    setupSse(res);
    await writeSseComment(res, "BlueMind AI streaming chat");
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

    req.log.info({ streamId, userId: req.user._id.toString() }, "Streaming chat started");

    const result = await createStreamingChatReply({
      userId: req.user._id,
      ...req.validated.body,
      signal: abortController.signal,
      onStart: async (conversation) => {
        const written = await writeSse(res, "ready", {
          streamId,
          conversation
        });

        if (!written) {
          abortController.abort();
        }
      },
      onResponseStart: async (ai) => {
        const written = await writeSse(res, "ai_start", {
          streamId,
          ai
        });

        if (!written) {
          abortController.abort();
        }
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

        if (!written) {
          abortController.abort();
        }
      }
    });

    await writeSse(res, "complete", {
      streamId,
      ...result
    });
    await writeSse(res, "done", { streamId });
    res.end();

    req.log.info({
      streamId,
      conversationId: result.conversation.conversationId,
      responseId: result.ai.responseId,
      durationMs: Date.now() - startedAt
    }, "Streaming chat completed");
  } catch (error) {
    if (clientClosed || error.code === "AI_STREAM_ABORTED") {
      req.log.info({
        streamId,
        durationMs: Date.now() - startedAt
      }, "Streaming chat aborted");
      return;
    }

    if (!res.headersSent) {
      next(error);
      return;
    }

    req.log.error({
      streamId,
      err: error,
      durationMs: Date.now() - startedAt
    }, "Streaming chat failed");

    await writeSse(res, "error", toStreamErrorPayload(error, streamId));
    await writeSse(res, "done", { streamId });
    res.end();
  } finally {
    clearInterval(heartbeat);
    req.off("close", abortOnClose);
  }
}

export async function streamHiddenChatMessage(req, res, next) {
  const streamId = randomUUID();
  const startedAt = Date.now();
  const abortController = new AbortController();
  let clientClosed = false;
  let heartbeat;

  function abortOnClose() {
    if (!res.writableEnded) {
      clientClosed = true;
      abortController.abort();
      req.log.info({ streamId }, "Hidden chat stream client disconnected");
    }
  }

  req.on("close", abortOnClose);

  try {
    setupSse(res);
    await writeSseComment(res, "BlueMind AI hidden streaming chat");
    await writeSse(res, "connected", { streamId, mode: "sse" });

    heartbeat = setInterval(() => {
      void writeSse(res, "heartbeat", {
        streamId,
        timestamp: new Date().toISOString()
      });
    }, 15000);
    heartbeat.unref?.();

    const result = await createHiddenStreamingChatReply({
      userId: req.user._id,
      ...req.validated.body,
      signal: abortController.signal,
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
    });

    await writeSse(res, "complete", { streamId, ...result });
    await writeSse(res, "done", { streamId });
    res.end();

    req.log.info({ streamId, durationMs: Date.now() - startedAt }, "Hidden chat stream completed");
  } catch (error) {
    if (clientClosed || error.code === "AI_STREAM_ABORTED") {
      req.log.info({ streamId, durationMs: Date.now() - startedAt }, "Hidden chat stream aborted");
      return;
    }

    if (!res.headersSent) {
      next(error);
      return;
    }

    req.log.error({ streamId, err: error, durationMs: Date.now() - startedAt }, "Hidden chat stream failed");
    await writeSse(res, "error", toStreamErrorPayload(error, streamId));
    await writeSse(res, "done", { streamId });
    res.end();
  } finally {
    clearInterval(heartbeat);
    req.off("close", abortOnClose);
  }
}
