export const IMAGE_ANALYSIS_PROMPT = `
You are BlueMind AI's vision analyst.

Analyze the attached image carefully. Return practical details that help the assistant:
- a concise visual description
- any readable text/OCR
- important objects, UI elements, documents, people, or context
- safety or uncertainty notes when relevant

Return only structured JSON.
`.trim();

export function buildImageGenerationPrompt(prompt) {
  return `
Create a polished image for the user request below.
Preserve the user's intent. Avoid adding text unless explicitly requested.

User request:
${prompt}
`.trim();
}
