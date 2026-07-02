import assert from "node:assert/strict";

process.env.JWT_SECRET ||= "test-jwt-secret-with-at-least-thirty-two-characters";
process.env.MONGODB_URI ||= "mongodb://127.0.0.1:27017/bluemind-test";
process.env.OPENAI_API_KEY ||= "test-openai-key";
process.env.OPENAI_MODEL = "text-only-test-model";
process.env.OPENAI_VISION_MODEL = "vision-capable-test-model";
process.env.REMINDER_SCHEDULER_ENABLED ||= "false";

const {
  attachImagesToLatestUserMessage,
  buildResponseModeOptions
} = await import("../src/modules/chat/chat.service.js");

const textOptions = buildResponseModeOptions({}, "general");
assert.equal(textOptions.aiOptions.model, "text-only-test-model");
assert.equal(textOptions.visionEnabled, false);

const visionOptions = buildResponseModeOptions({}, "general", { forceVision: true });
assert.equal(visionOptions.aiOptions.model, "vision-capable-test-model");
assert.equal(visionOptions.visionEnabled, true);

const studyVisionOptions = buildResponseModeOptions({}, "study", { forceVision: true });
assert.equal(studyVisionOptions.aiOptions.model, "vision-capable-test-model");
assert.equal(studyVisionOptions.visionEnabled, true);

const imageDataUrls = [
  "data:image/png;base64,iVBORw0KGgo=",
  "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
  "data:image/webp;base64,UklGRiIAAABXRUJQVlA4"
];
const aiInput = attachImagesToLatestUserMessage(
  [
    { role: "system", content: "System context" },
    { role: "user", content: "What is in these images?" }
  ],
  imageDataUrls.map((dataUrl) => ({ dataUrl })),
  "Please analyze the attached images."
);
const userMessage = aiInput.at(-1);

assert.equal(userMessage.role, "user");
assert.equal(Array.isArray(userMessage.content), true);
assert.equal(userMessage.content[0].type, "input_text");
assert.equal(userMessage.content[0].text, "What is in these images?");
assert.deepEqual(
  userMessage.content.slice(1).map((part) => part.type),
  ["input_image", "input_image", "input_image"]
);
assert.deepEqual(
  userMessage.content.slice(1).map((part) => part.image_url),
  imageDataUrls
);
assert.deepEqual(
  userMessage.content.slice(1).map((part) => part.detail),
  ["high", "high", "high"]
);

console.log("Image chat pipeline payload and model selection verified.");
