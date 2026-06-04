import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { reportIssue } from "./support.controller.js";
import { reportIssueSchema } from "./support.validation.js";

const router = Router();

router.post("/issues", requireAuth, validate(reportIssueSchema), reportIssue);

export default router;
