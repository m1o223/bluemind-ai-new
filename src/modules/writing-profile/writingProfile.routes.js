import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { analyzeProfile, confirmProfile, getProfile } from "./writingProfile.controller.js";
import { analyzeWritingProfileSchema, confirmWritingProfileSchema } from "./writingProfile.validation.js";

const router = Router();

router.use(requireAuth);

router.get("/", getProfile);
router.post("/analyze", validate(analyzeWritingProfileSchema), analyzeProfile);
router.post("/confirm", validate(confirmWritingProfileSchema), confirmProfile);

export default router;
