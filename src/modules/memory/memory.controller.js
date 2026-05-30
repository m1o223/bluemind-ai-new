import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendResponse } from "../../utils/sendResponse.js";
import {
  createManualMemory,
  deleteManualMemory,
  listUserMemories,
  updateManualMemory
} from "./memory.service.js";

export const listMemories = asyncHandler(async (req, res) => {
  const memories = await listUserMemories(req.user._id);
  sendResponse(res, 200, { memories });
});

export const createMemory = asyncHandler(async (req, res) => {
  const memory = await createManualMemory(req.user._id, req.validated.body);
  sendResponse(res, 201, { memory });
});

export const updateMemory = asyncHandler(async (req, res) => {
  const memory = await updateManualMemory(
    req.user._id,
    req.validated.params.memoryId,
    req.validated.body
  );

  sendResponse(res, 200, { memory });
});

export const deleteMemory = asyncHandler(async (req, res) => {
  const result = await deleteManualMemory(req.user._id, req.validated.params.memoryId);
  sendResponse(res, 200, result);
});
