import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { toPreferencesResponse, updateUserPreferences } from "./preferences.service.js";
import { getUiTranslations } from "./ui-translation.service.js";

export const getPreferences = asyncHandler(async (req, res) => {
  sendResponse(res, 200, {
    preferences: toPreferencesResponse(req.user)
  });
});

export const patchPreferences = asyncHandler(async (req, res) => {
  const result = await updateUserPreferences(req.user, req.validated.body);

  req.log.info({
    userId: req.user._id.toString(),
    preferences: result.preferences
  }, "User preferences updated");

  sendResponse(res, 200, result);
});

export const getTranslations = asyncHandler(async (req, res) => {
  const result = await getUiTranslations(req.validated.params.language);

  sendResponse(res, 200, result);
});
