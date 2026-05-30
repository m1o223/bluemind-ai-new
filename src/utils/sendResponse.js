export function sendResponse(res, statusCode, data, meta = undefined) {
  res.status(statusCode).json({
    success: true,
    data,
    meta
  });
}
