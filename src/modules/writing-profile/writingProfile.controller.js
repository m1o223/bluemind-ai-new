import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendResponse } from "../../utils/sendResponse.js";
import {
  analyzeAndDraftWritingProfile,
  confirmWritingProfile,
  getWritingProfile
} from "./writingProfile.service.js";

export const getProfile = asyncHandler(async (req, res) => {
  const result = await getWritingProfile(req.user._id);
  sendResponse(res, 200, result);
});

export const analyzeProfile = asyncHandler(async (req, res) => {
  const result = await analyzeAndDraftWritingProfile(req.user._id, req.validated.body);
  sendResponse(res, 200, result, "Writing Profile analyzed");
});

export const confirmProfile = asyncHandler(async (req, res) => {
  const result = await confirmWritingProfile(req.user._id, req.validated.body);
  sendResponse(res, 200, result, "Writing Profile updated");
});
