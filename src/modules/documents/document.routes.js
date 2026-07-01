import express, { Router } from "express";

import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { analyzeScheduleDocument } from "./document.controller.js";
import { analyzeScheduleDocumentSchema } from "./document.validation.js";

const router = Router();

router.use(requireAuth);

router.post(
  "/analyze-schedule",
  express.raw({
    type: "*/*",
    limit: env.DOCUMENT_UPLOAD_MAX_BYTES
  }),
  validate(analyzeScheduleDocumentSchema),
  analyzeScheduleDocument
);

export default router;
