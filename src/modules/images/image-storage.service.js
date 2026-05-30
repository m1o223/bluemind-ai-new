import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";

export const ALLOWED_IMAGE_TYPES = {
  "image/png": {
    extension: "png",
    signatures: ["89504e470d0a1a0a"]
  },
  "image/jpeg": {
    extension: "jpg",
    signatures: ["ffd8ff"]
  },
  "image/webp": {
    extension: "webp",
    signatures: ["52494646"]
  }
};

function safeName(fileName = "image") {
  return fileName
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 120);
}

function monthFolder(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getStorageRoot() {
  return path.resolve(process.cwd(), env.IMAGE_UPLOAD_DIR);
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl || "");

  if (!match) {
    throw new AppError("Invalid image data URL", 400, "INVALID_IMAGE_DATA_URL");
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64")
  };
}

export function decodeImagePayload({ dataUrl, dataBase64, mimeType }) {
  if (dataUrl) {
    return parseDataUrl(dataUrl);
  }

  if (!dataBase64 || !mimeType) {
    throw new AppError("Image dataBase64 and mimeType are required", 400, "IMAGE_DATA_REQUIRED");
  }

  return {
    mimeType,
    buffer: Buffer.from(dataBase64, "base64")
  };
}

export function validateImageBuffer({ buffer, mimeType }) {
  const type = ALLOWED_IMAGE_TYPES[mimeType];

  if (!type) {
    throw new AppError("Unsupported image type", 400, "UNSUPPORTED_IMAGE_TYPE", {
      allowedTypes: Object.keys(ALLOWED_IMAGE_TYPES)
    });
  }

  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw new AppError("Image file is empty", 400, "EMPTY_IMAGE_FILE");
  }

  if (buffer.length > env.IMAGE_UPLOAD_MAX_BYTES) {
    throw new AppError("Image is too large", 413, "IMAGE_TOO_LARGE", {
      maxBytes: env.IMAGE_UPLOAD_MAX_BYTES
    });
  }

  const hex = buffer.subarray(0, 12).toString("hex");
  const signatureMatches = type.signatures.some((signature) => hex.startsWith(signature));

  if (!signatureMatches) {
    throw new AppError("Image content does not match declared type", 400, "IMAGE_TYPE_MISMATCH");
  }

  if (mimeType === "image/webp" && buffer.subarray(8, 12).toString("ascii") !== "WEBP") {
    throw new AppError("Invalid WEBP image", 400, "INVALID_WEBP_IMAGE");
  }

  return {
    extension: type.extension,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    sizeBytes: buffer.length
  };
}

export async function saveImageBuffer({ userId, buffer, mimeType, originalName = "image", kind = "upload" }) {
  const validation = validateImageBuffer({ buffer, mimeType });
  const folder = path.join(kind, userId.toString(), monthFolder());
  const fileName = `${randomUUID()}-${safeName(originalName)}.${validation.extension}`;
  const relativePath = path.join(folder, fileName);
  const absolutePath = path.join(getStorageRoot(), relativePath);

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, buffer, { flag: "wx" });

  return {
    ...validation,
    fileName,
    relativePath,
    absolutePath,
    extension: validation.extension
  };
}

export function getImageAbsolutePath(relativePath) {
  const root = getStorageRoot();
  const absolutePath = path.resolve(root, relativePath);
  const relativeToRoot = path.relative(root, absolutePath);

  if (relativeToRoot.startsWith("..") || path.isAbsolute(relativeToRoot)) {
    throw new AppError("Invalid image path", 400, "INVALID_IMAGE_PATH");
  }

  return absolutePath;
}

export async function readImageBuffer(asset) {
  return readFile(getImageAbsolutePath(asset.relativePath));
}

export async function assetToDataUrl(asset) {
  const buffer = await readImageBuffer(asset);

  return `data:${asset.mimeType};base64,${buffer.toString("base64")}`;
}
