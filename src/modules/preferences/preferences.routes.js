import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { getPreferences, getTranslations, patchPreferences } from "./preferences.controller.js";
import { languageParamsSchema, updatePreferencesSchema } from "./preferences.validation.js";

const router = Router();

router.get("/translations/:language", validate(languageParamsSchema), getTranslations);

router.use(requireAuth);

router.get("/", getPreferences);
router.patch("/", validate(updatePreferencesSchema), patchPreferences);

export default router;
