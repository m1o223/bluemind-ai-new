import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendResponse } from "../../utils/sendResponse.js";
import { searchUserContent } from "./search.service.js";

export const universalSearch = asyncHandler(async (req, res) => {
  sendResponse(res, 200, await searchUserContent(req.user._id, req.validated.query));
});
