import { Router } from "express";

import authRoutes from "../modules/auth/auth.routes.js";
import chatRoutes from "../modules/chat/chat.routes.js";
import documentRoutes from "../modules/documents/document.routes.js";
import imageRoutes from "../modules/images/image.routes.js";
import memoryRoutes from "../modules/memory/memory.routes.js";
import preferencesRoutes from "../modules/preferences/preferences.routes.js";
import privateSpaceRoutes from "../modules/private-spaces/privateSpace.routes.js";
import reminderRoutes from "../modules/reminders/reminder.routes.js";
import studyPlanRoutes from "../modules/study-plans/study-plan.routes.js";
import supportRoutes from "../modules/support/support.routes.js";

const router = Router();

router.get("/", (_req, res) => {
  res.status(200).json({
    name: "BlueMind AI API",
    version: "0.1.0"
  });
});

router.use("/auth", authRoutes);
router.use("/chat", chatRoutes);
router.use("/documents", documentRoutes);
router.use("/images", imageRoutes);
router.use("/memory", memoryRoutes);
router.use("/preferences", preferencesRoutes);
router.use("/private-spaces", privateSpaceRoutes);
router.use("/reminders", reminderRoutes);
router.use("/study-plans", studyPlanRoutes);
router.use("/support", supportRoutes);

export default router;
