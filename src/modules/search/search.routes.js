import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { universalSearch } from "./search.controller.js";
import { universalSearchSchema } from "./search.validation.js";

const router = Router();
router.get("/", requireAuth, validate(universalSearchSchema), universalSearch);
export default router;
