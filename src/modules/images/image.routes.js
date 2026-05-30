import express, { Router } from "express";

import { env } from "../../config/env.js";
import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  analyzeImageAsset,
  generateImageAsset,
  getImageBinary,
  getImageMetadata,
  listImageHistory,
  uploadImage,
  uploadImageBinary
} from "./image.controller.js";
import {
  analyzeImageSchema,
  binaryUploadQuerySchema,
  generateImageSchema,
  imageIdSchema,
  listImagesSchema,
  uploadImageSchema
} from "./image.validation.js";

const router = Router();

router.use(requireAuth);

router.get("/", validate(listImagesSchema), listImageHistory);
router.post("/upload", validate(uploadImageSchema), uploadImage);
router.post(
  "/upload-binary",
  express.raw({
    type: ["image/png", "image/jpeg", "image/webp"],
    limit: env.IMAGE_UPLOAD_MAX_BYTES
  }),
  validate(binaryUploadQuerySchema),
  uploadImageBinary
);
router.post("/generate", validate(generateImageSchema), generateImageAsset);
router.get("/:imageId", validate(imageIdSchema), getImageMetadata);
router.get("/:imageId/file", validate(imageIdSchema), getImageBinary);
router.post("/:imageId/analyze", validate(analyzeImageSchema), analyzeImageAsset);

export default router;
