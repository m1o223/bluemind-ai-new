import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import { analyzeSchoolTimetableImage } from "./study-plan.controller.js";
import { analyzeTimetableSchema } from "./study-plan.validation.js";

const router = Router();

router.use(requireAuth);

router.post("/timetable/analyze", validate(analyzeTimetableSchema), analyzeSchoolTimetableImage);

export default router;
