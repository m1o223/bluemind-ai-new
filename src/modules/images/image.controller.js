import { asyncHandler } from "../../utils/asyncHandler.js";
import { AppError } from "../../utils/AppError.js";
import { sendResponse } from "../../utils/sendResponse.js";
import {
  analyzeImage,
  generateImage,
  getImageFile,
  listImages,
  uploadImageBuffer,
  uploadImageFromJson
} from "./image.service.js";

export const uploadImage = asyncHandler(async (req, res) => {
  const image = await uploadImageFromJson(req.user._id, req.validated.body);

  req.log.info({ imageId: image.id, sizeBytes: image.sizeBytes }, "Image uploaded");
  sendResponse(res, 201, { image });
});

export const uploadImageBinary = asyncHandler(async (req, res) => {
  const mimeType = (req.headers["content-type"] || "").split(";")[0].trim();
  const originalName = req.headers["x-file-name"] || "image";

  if (!Buffer.isBuffer(req.body)) {
    throw new AppError("Binary image body is required", 400, "IMAGE_BINARY_BODY_REQUIRED");
  }

  const image = await uploadImageBuffer(req.user._id, {
    buffer: req.body,
    mimeType,
    originalName: Array.isArray(originalName) ? originalName[0] : originalName,
    conversationId: req.validated.query.conversationId
  });

  req.log.info({ imageId: image.id, sizeBytes: image.sizeBytes }, "Binary image uploaded");
  sendResponse(res, 201, { image });
});

export const listImageHistory = asyncHandler(async (req, res) => {
  const images = await listImages(req.user._id, req.validated.query);
  sendResponse(res, 200, { images });
});

export const getImageMetadata = asyncHandler(async (req, res) => {
  const { image } = await getImageFile(req.user._id, req.validated.params.imageId);
  sendResponse(res, 200, { image });
});

export const getImageBinary = asyncHandler(async (req, res) => {
  const { image, absolutePath } = await getImageFile(req.user._id, req.validated.params.imageId);

  res.setHeader("Content-Type", image.mimeType);
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(absolutePath);
});

export const analyzeImageAsset = asyncHandler(async (req, res) => {
  const result = await analyzeImage(req.user._id, req.validated.params.imageId, req.validated.body, req.user.preferences);

  req.log.info({ imageId: result.image.id }, "Image analyzed");
  sendResponse(res, 200, result);
});

export const generateImageAsset = asyncHandler(async (req, res) => {
  const result = await generateImage(req.user._id, req.validated.body);

  req.log.info({ imageCount: result.images.length }, "Image generated");
  sendResponse(res, 201, result);
});
