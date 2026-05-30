import { ImageAsset } from "./image.model.js";

export function createImageAsset(asset) {
  return ImageAsset.create(asset);
}

export function findImageById(imageId, userId) {
  return ImageAsset.findOne({ _id: imageId, userId });
}

export function findImagesByIds(imageIds, userId) {
  return ImageAsset.find({
    _id: { $in: imageIds },
    userId
  });
}

export function listUserImages(userId, { limit = 50, kind } = {}) {
  const filter = { userId };

  if (kind) {
    filter.kind = kind;
  }

  return ImageAsset.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit);
}

export function saveImageAsset(asset) {
  return asset.save();
}
