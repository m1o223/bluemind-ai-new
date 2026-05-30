import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { analyzeSchoolTimetable } from "./study-plan.service.js";

export const analyzeSchoolTimetableImage = asyncHandler(async (req, res) => {
  const result = await analyzeSchoolTimetable({
    userId: req.user._id,
    imageId: req.validated.body.imageId,
    preferences: req.user.preferences,
    languageHint: req.validated.body.languageHint
  });

  req.log.info({
    imageId: req.validated.body.imageId,
    entries: result.timetable.entries.length,
    confidence: result.timetable.confidence
  }, "School timetable image analyzed");

  sendResponse(res, 200, result);
});
