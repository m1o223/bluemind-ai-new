import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createFeatureNotification,
  getNotificationStatus,
  listNotifications
} from "./smartNotification.controller.js";
import {
  createFeatureNotificationSchema,
  listSmartNotificationsSchema
} from "./smartNotification.validation.js";

const router = Router();

router.use(requireAuth);

router.get("/", validate(listSmartNotificationsSchema), listNotifications);
router.get("/status", getNotificationStatus);
router.post("/feature-event", validate(createFeatureNotificationSchema), createFeatureNotification);

export default router;
