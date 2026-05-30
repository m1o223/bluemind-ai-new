import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createMemory,
  deleteMemory,
  listMemories,
  updateMemory
} from "./memory.controller.js";
import {
  createMemorySchema,
  memoryIdSchema,
  updateMemorySchema
} from "./memory.validation.js";

const router = Router();

router.use(requireAuth);

router.get("/", listMemories);
router.post("/", validate(createMemorySchema), createMemory);
router.patch("/:memoryId", validate(updateMemorySchema), updateMemory);
router.delete("/:memoryId", validate(memoryIdSchema), deleteMemory);

export default router;
