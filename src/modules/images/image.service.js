import { openai } from "../../config/openai.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/AppError.js";
import { generateJson } from "../ai/ai.service.js";
import { findConversationById, saveConversation } from "../memory/memory.repository.js";
import { upsertUserMemory } from "../memory/memory.repository.js";
import { getLanguageName, normalizePreferences } from "../preferences/preferences.service.js";
import { queueSmartNotification } from "../notifications/smartNotification.service.js";
import { buildImageGenerationPrompt, IMAGE_ANALYSIS_PROMPT } from "./image.prompt.js";
import {
  assetToDataUrl,
  decodeImagePayload,
  getImageAbsolutePath,
  readImageBuffer,
  saveImageBuffer,
  validateImageBuffer
} from "./image-storage.service.js";
import {
  createImageAsset,
  findImageById,
  findImagesByIds,
  listUserImages,
  saveImageAsset
} from "./image.repository.js";

const analysisSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: "string" },
    extractedText: { type: "string" },
    objects: {
      type: "array",
      items: { type: "string" }
    },
    safetyNotes: { type: "string" }
  },
  required: ["description", "extractedText", "objects", "safetyNotes"]
};

function mimeFromFormat(format) {
  return {
    png: "image/png",
    jpeg: "image/jpeg",
    webp: "image/webp"
  }[format] || "image/png";
}

function toImageResponse(asset) {
  return {
    id: asset._id.toString(),
    kind: asset.kind,
    status: asset.status,
    conversationId: asset.conversationId?.toString(),
    originalName: asset.originalName,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    extension: asset.extension,
    sizeBytes: asset.sizeBytes,
    sha256: asset.sha256,
    prompt: asset.prompt,
    revisedPrompt: asset.revisedPrompt,
    analysis: asset.analysis,
    url: `/api/images/${asset._id}/file`,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt
  };
}

async function assertConversation(userId, conversationId) {
  if (!conversationId) {
    return undefined;
  }

  const conversation = await findConversationById(conversationId, userId);

  if (!conversation) {
    throw new AppError("Conversation was not found", 404, "CONVERSATION_NOT_FOUND");
  }

  return conversation._id;
}

export async function uploadImageFromJson(userId, payload) {
  const decoded = decodeImagePayload(payload);

  return uploadImageBuffer(userId, {
    buffer: decoded.buffer,
    mimeType: decoded.mimeType,
    originalName: payload.fileName,
    conversationId: payload.conversationId,
    metadata: payload.metadata
  });
}

export async function uploadImageBuffer(userId, {
  buffer,
  mimeType,
  originalName,
  conversationId,
  metadata
}) {
  const conversationObjectId = await assertConversation(userId, conversationId);
  const stored = await saveImageBuffer({
    userId,
    buffer,
    mimeType,
    originalName,
    kind: "upload"
  });
  const asset = await createImageAsset({
    userId,
    conversationId: conversationObjectId,
    kind: "upload",
    status: "ready",
    originalName: originalName || "image",
    fileName: stored.fileName,
    relativePath: stored.relativePath,
    mimeType,
    extension: stored.extension,
    sizeBytes: stored.sizeBytes,
    sha256: stored.sha256,
    metadata: metadata || {}
  });

  return toImageResponse(asset);
}

export async function listImages(userId, options) {
  const images = await listUserImages(userId, options);

  return images.map(toImageResponse);
}

export async function getImage(userId, imageId) {
  const image = await findImageById(imageId, userId);

  if (!image) {
    throw new AppError("Image was not found", 404, "IMAGE_NOT_FOUND");
  }

  return image;
}

export async function getImageFile(userId, imageId) {
  const image = await getImage(userId, imageId);

  return {
    image: toImageResponse(image),
    absolutePath: getImageAbsolutePath(image.relativePath)
  };
}

export async function resolveChatImages(userId, imageIds = []) {
  if (!imageIds.length) {
    return [];
  }

  if (imageIds.length > env.IMAGE_CHAT_MAX_ATTACHMENTS) {
    throw new AppError("Too many image attachments", 400, "TOO_MANY_IMAGE_ATTACHMENTS", {
      max: env.IMAGE_CHAT_MAX_ATTACHMENTS
    });
  }

  const images = await findImagesByIds(imageIds, userId);

  if (images.length !== imageIds.length) {
    throw new AppError("One or more images were not found", 404, "IMAGE_NOT_FOUND");
  }

  return Promise.all(images.map(async (asset) => ({
    asset,
    response: toImageResponse(asset),
    dataUrl: await assetToDataUrl(asset)
  })));
}

async function saveImageAnalysisMemory(userId, asset) {
  const contentParts = [
    asset.analysis?.description && `Image description: ${asset.analysis.description}`,
    asset.analysis?.extractedText && `Text in image: ${asset.analysis.extractedText}`,
    asset.analysis?.objects?.length && `Image objects: ${asset.analysis.objects.join(", ")}`
  ].filter(Boolean);

  if (!contentParts.length) {
    return null;
  }

  return upsertUserMemory(userId, {
    type: "summary",
    key: `image:${asset._id}:analysis`,
    content: contentParts.join("\n"),
    tags: ["image", "vision", ...asset.analysis.objects.slice(0, 5).map((item) => item.toLowerCase())],
    importance: 0.55,
    confidence: 0.78,
    pinned: false,
    source: {
      conversationId: asset.conversationId,
      kind: "extracted"
    },
    metadata: {
      imageId: asset._id.toString(),
      analyzer: "openai-vision"
    }
  });
}

function buildImageAnalysisInstructions(preferences) {
  const normalizedPreferences = normalizePreferences(preferences);
  const languageName = getLanguageName(normalizedPreferences.language);

  return [
    IMAGE_ANALYSIS_PROMPT,
    `The user's preferred language is ${languageName} (${normalizedPreferences.language}).`,
    "Return description, extractedText, objects, and safetyNotes in the preferred language when possible."
  ].join("\n\n");
}

export async function analyzeImage(userId, imageId, { prompt } = {}, preferences) {
  const asset = await getImage(userId, imageId);
  const dataUrl = await assetToDataUrl(asset);
  const result = await generateJson({
    name: "image_analysis",
    schema: analysisSchema,
    instructions: buildImageAnalysisInstructions(preferences),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: prompt || "Analyze this image for the current BlueMind AI conversation."
          },
          {
            type: "input_image",
            image_url: dataUrl,
            detail: "high"
          }
        ]
      }
    ],
    temperature: 0.1,
    maxOutputTokens: 5000
  });

  asset.analysis = {
    description: result.data.description || "",
    extractedText: result.data.extractedText || "",
    objects: result.data.objects || [],
    safetyNotes: result.data.safetyNotes || "",
    analyzedAt: new Date(),
    ai: result.metadata
  };
  await saveImageAsset(asset);
  await saveImageAnalysisMemory(userId, asset);

  return {
    image: toImageResponse(asset),
    analysis: asset.analysis
  };
}

export async function analyzeImagesForMemory(userId, images) {
  const results = [];

  for (const image of images) {
    if (image.asset.analysis?.description) {
      results.push(toImageResponse(image.asset));
      continue;
    }

    try {
      const result = await analyzeImage(userId, image.asset._id, {
        prompt: "Analyze this chat attachment for future memory. Focus on useful visual facts and readable text."
      });
      results.push(result.image);
    } catch {
      // Image memory should not make chat fail.
    }
  }

  return results;
}

export async function generateImage(userId, payload) {
  const conversationObjectId = await assertConversation(userId, payload.conversationId);
  const n = Math.min(payload.n || 1, env.IMAGE_GENERATION_MAX_RESULTS);
  const outputFormat = payload.outputFormat || "png";
  const response = await openai.images.generate({
    model: env.OPENAI_IMAGE_MODEL,
    prompt: buildImageGenerationPrompt(payload.prompt),
    n,
    size: payload.size,
    quality: payload.quality,
    output_format: outputFormat,
    background: payload.background,
    user: userId.toString()
  });
  const images = [];

  for (const [index, image] of (response.data || []).entries()) {
    let buffer;
    let mimeType = mimeFromFormat(outputFormat);

    if (image.b64_json) {
      buffer = Buffer.from(image.b64_json, "base64");
    } else if (image.url) {
      const downloaded = await fetch(image.url);

      if (!downloaded.ok) {
        throw new AppError("Generated image download failed", 502, "GENERATED_IMAGE_DOWNLOAD_FAILED");
      }

      const arrayBuffer = await downloaded.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
      mimeType = downloaded.headers.get("content-type")?.split(";")[0] || mimeType;
    } else {
      throw new AppError("Image provider returned no image data", 502, "IMAGE_GENERATION_EMPTY");
    }

    validateImageBuffer({ buffer, mimeType });

    const stored = await saveImageBuffer({
      userId,
      buffer,
      mimeType,
      originalName: `generated-${index + 1}`,
      kind: "generated"
    });
    const asset = await createImageAsset({
      userId,
      conversationId: conversationObjectId,
      kind: "generated",
      status: "ready",
      originalName: `generated-${index + 1}`,
      fileName: stored.fileName,
      relativePath: stored.relativePath,
      mimeType,
      extension: stored.extension,
      sizeBytes: stored.sizeBytes,
      sha256: stored.sha256,
      prompt: payload.prompt,
      revisedPrompt: image.revised_prompt || "",
      metadata: {
        ...payload.metadata,
        ai: {
          provider: "openai",
          model: env.OPENAI_IMAGE_MODEL,
          usage: response.usage,
          created: response.created
        }
      }
    });

    await upsertUserMemory(userId, {
      type: "summary",
      key: `image:${asset._id}:generated`,
      content: `Generated image prompt: ${payload.prompt}`,
      tags: ["image", "generated"],
      importance: 0.35,
      confidence: 0.8,
      pinned: false,
      source: {
        conversationId: conversationObjectId,
        kind: "extracted"
      },
      metadata: {
        imageId: asset._id.toString(),
        kind: "generated"
      }
    });

    images.push(toImageResponse(asset));
  }

  if (conversationObjectId && images.length) {
    const conversation = await findConversationById(payload.conversationId, userId);

    if (conversation) {
      conversation.messages.push({
        role: "assistant",
        content: `Generated image: ${payload.prompt}`,
        metadata: {
          kind: "image_generation",
          prompt: payload.prompt,
          attachments: images.map((image) => ({
            id: image.id,
            kind: image.kind,
            mimeType: image.mimeType,
            url: image.url,
            prompt: image.prompt,
            revisedPrompt: image.revisedPrompt
          }))
        }
      });
      await saveConversation(conversation);
    }
  }

  if (images.length) {
    try {
      await queueSmartNotification({
        userId,
        type: "studio",
        sourceId: images[0].id,
        source: {
          prompt: payload.prompt,
          imageCount: images.length,
          deepLink: "/mobile/create-image"
        },
        dedupeKey: `studio:${images.map((image) => image.id).join(":")}`
      });
    } catch (error) {
      // Image generation should not fail because notification queueing failed.
    }
  }

  return {
    images,
    ai: {
      provider: "openai",
      model: env.OPENAI_IMAGE_MODEL,
      usage: response.usage,
      created: response.created
    }
  };
}

export async function imageAssetToChatAttachment(image) {
  const buffer = await readImageBuffer(image.asset);

  return {
    id: image.asset._id.toString(),
    mimeType: image.asset.mimeType,
    dataUrl: `data:${image.asset.mimeType};base64,${buffer.toString("base64")}`,
    metadata: image.response
  };
}
