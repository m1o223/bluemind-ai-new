import { asyncHandler } from "../../utils/asyncHandler.js";
import { createSupportIssueReport } from "./support.service.js";

export const reportIssue = asyncHandler(async (req, res) => {
  const result = await createSupportIssueReport({
    user: req.user,
    ...req.validated.body
  });

  res.status(201).json({
    success: true,
    data: result
  });
});
