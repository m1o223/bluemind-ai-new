import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendResponse } from "../../utils/sendResponse.js";
import {
  getSmartNotificationRuntimeStatus,
  listSmartNotifications,
  queueSmartNotification
} from "./smartNotification.service.js";

export const listNotifications = asyncHandler(async (req, res) => {
  const notifications = await listSmartNotifications(req.user._id, req.validated.query);
  sendResponse(res, 200, { notifications });
});

export const getNotificationStatus = asyncHandler(async (_req, res) => {
  sendResponse(res, 200, getSmartNotificationRuntimeStatus());
});

export const createFeatureNotification = asyncHandler(async (req, res) => {
  const notification = await queueSmartNotification({
    userId: req.user._id,
    type: req.validated.body.type,
    source: req.validated.body.source,
    sourceId: req.validated.body.sourceId,
    scheduledFor: req.validated.body.scheduledFor,
    dedupeKey: req.validated.body.dedupeKey
  });

  sendResponse(res, 201, { notification }, "Notification queued");
});
