import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../utils/AppError.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { analyzeScheduleDocumentBuffer } from "./document.service.js";

function decodeFileName(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return "schedule-document";

  try {
    return decodeURIComponent(raw);
  } catch {
    return String(raw);
  }
}

export const analyzeScheduleDocument = asyncHandler(async (req, res) => {
  const mimeType = String(req.headers["content-type"] || "application/octet-stream").split(";")[0].trim();
  const originalName = decodeFileName(req.headers["x-file-name"]);

  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    throw new AppError("Binary document body is required", 400, "DOCUMENT_BINARY_BODY_REQUIRED");
  }

  const result = await analyzeScheduleDocumentBuffer({
    buffer: req.body,
    mimeType,
    originalName,
    preferences: req.user.preferences
  });

  req.log.info({
    fileName: originalName,
    mimeType,
    sizeBytes: req.body.length,
    documentType: result.analysis.documentType,
    events: result.analysis.events.length
  }, "Schedule document analyzed");

  sendResponse(res, 200, result);
});
