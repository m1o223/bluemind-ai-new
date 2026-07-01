import { Router } from "express";
import express from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  getConversation,
  getLatestConversation,
  listConversations,
  searchConversations,
  deleteConversation,
  renameConversation,
  sendChatMessage,
  createVoiceSpeech,
  transcribeVoiceMessage,
  streamHiddenChatMessage,
  streamChatMessage
} from "./chat.controller.js";
import { chatConversationParamsSchema, chatMessageSchema, renameConversationSchema, searchConversationsSchema } from "./chat.validation.js";

const router = Router();

function logChatRequest(req, _res, next) {
  req.log.info({
    chatFlow: "request_received",
    path: req.originalUrl,
    userId: req.user?._id?.toString(),
    body: req.body,
    bodyKeys: Object.keys(req.body || {}),
    contentType: req.headers["content-type"],
    hasMessage: Boolean(req.body?.message),
    messageLength: req.body?.message ? String(req.body.message).length : 0,
    conversationId: req.body?.conversationId,
    imageIdsCount: Array.isArray(req.body?.imageIds) ? req.body.imageIds.length : 0
  }, "Chat request body received");
  next();
}

router.post("/", requireAuth, logChatRequest, validate(chatMessageSchema), sendChatMessage);
router.post("/stream", requireAuth, logChatRequest, validate(chatMessageSchema), streamChatMessage);
router.post("/hidden/stream", requireAuth, logChatRequest, validate(chatMessageSchema), streamHiddenChatMessage);
router.post("/voice/transcribe", requireAuth, express.raw({ type: "audio/*", limit: "12mb" }), transcribeVoiceMessage);
router.post("/voice/speech", requireAuth, createVoiceSpeech);
router.get("/conversations", requireAuth, listConversations);
router.get("/conversations/search", requireAuth, validate(searchConversationsSchema), searchConversations);
router.get("/conversations/latest", requireAuth, getLatestConversation);
router.get(
  "/conversations/:conversationId",
  requireAuth,
  validate(chatConversationParamsSchema),
  getConversation
);
router.patch(
  "/conversations/:conversationId",
  requireAuth,
  validate(renameConversationSchema),
  renameConversation
);
router.delete(
  "/conversations/:conversationId",
  requireAuth,
  validate(chatConversationParamsSchema),
  deleteConversation
);

export default router;
