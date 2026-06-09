import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createSpace,
  createSpaceChat,
  changeSpacePin,
  deleteSpace,
  deleteSpaceChat,
  getSpaceChat,
  listSpaceChats,
  listSpaces,
  renameSpace,
  sendSpaceMessage,
  streamSpaceMessage,
  renameSpaceChat,
  unlockSpace
} from "./privateSpace.controller.js";
import {
  createPrivateSpaceSchema,
  changePrivateSpacePinSchema,
  privateSpaceChatParamsSchema,
  privateSpaceConversationParamsSchema,
  privateSpaceMessageSchema,
  privateSpaceParamsSchema,
  renamePrivateSpaceSchema,
  unlockPrivateSpaceSchema
} from "./privateSpace.validation.js";
import { renameConversationSchema } from "../chat/chat.validation.js";

const router = Router();

router.use(requireAuth);

router.post("/", validate(createPrivateSpaceSchema), createSpace);
router.get("/", listSpaces);
router.post("/:id/unlock", validate(unlockPrivateSpaceSchema), unlockSpace);
router.patch("/:id", validate(renamePrivateSpaceSchema), renameSpace);
router.patch("/:id/pin", validate(changePrivateSpacePinSchema), changeSpacePin);
router.delete("/:id", validate(privateSpaceParamsSchema), deleteSpace);
router.get("/:id/chats", validate(privateSpaceChatParamsSchema), listSpaceChats);
router.post("/:id/chats", validate(privateSpaceChatParamsSchema), createSpaceChat);
router.get("/:id/chats/:conversationId", validate(privateSpaceConversationParamsSchema), getSpaceChat);
router.patch("/:id/chats/:conversationId", validate(renameConversationSchema.extend({
  params: privateSpaceConversationParamsSchema.shape.params
})), renameSpaceChat);
router.delete("/:id/chats/:conversationId", validate(privateSpaceConversationParamsSchema), deleteSpaceChat);
router.post("/:id/messages", validate(privateSpaceMessageSchema), sendSpaceMessage);
router.post("/:id/messages/stream", validate(privateSpaceMessageSchema), streamSpaceMessage);

export default router;
