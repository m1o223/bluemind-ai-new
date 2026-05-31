import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  aiExtractReminder,
  aiSuggestReminder,
  createReminder,
  deleteReminder,
  getReminder,
  getNotificationStatus,
  listReminders,
  registerDevice,
  sendTestNotification,
  updateReminder
} from "./reminder.controller.js";
import {
  aiExtractReminderSchema,
  aiSuggestReminderSchema,
  createReminderSchema,
  listRemindersSchema,
  registerDeviceSchema,
  reminderIdSchema,
  testNotificationSchema,
  updateReminderSchema
} from "./reminder.validation.js";

const router = Router();

router.use(requireAuth);

router.get("/", validate(listRemindersSchema), listReminders);
router.post("/", validate(createReminderSchema), createReminder);
router.post("/ai-extract", validate(aiExtractReminderSchema), aiExtractReminder);
router.post("/ai-suggest", validate(aiSuggestReminderSchema), aiSuggestReminder);
router.post("/register-device", validate(registerDeviceSchema), registerDevice);
router.get("/notification-status", getNotificationStatus);
router.post("/test-notification", validate(testNotificationSchema), sendTestNotification);
router.get("/:reminderId", validate(reminderIdSchema), getReminder);
router.patch("/:reminderId", validate(updateReminderSchema), updateReminder);
router.delete("/:reminderId", validate(reminderIdSchema), deleteReminder);

export default router;
