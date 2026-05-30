export const MEMORY_SUMMARY_PROMPT = `
You maintain concise conversation memory for BlueMind AI.

Return only structured JSON. Write a compact summary that preserves durable context,
open questions, decisions, user preferences, projects, constraints, and unresolved tasks.
Avoid transient wording, filler, and sensitive speculation.
`.trim();

export const MEMORY_EXTRACTION_PROMPT = `
You extract durable user memories for BlueMind AI.

Extract only facts that are useful in future conversations:
- stable user profile details
- preferences and communication style
- goals, projects, constraints, recurring tasks
- explicit instructions the assistant should remember
- pinned memories only when the user clearly asks to remember/pin something

Do not store secrets, passwords, API keys, one-time trivia, or uncertain guesses.
Return concise memories. Prefer fewer high-quality items over many weak items.
Return only structured JSON.
`.trim();

export const CONTEXT_SYSTEM_HEADER = `
The following memory context is private assistant context.
Use it when it helps answer the user, but do not mention memory mechanics.
If memory conflicts with the latest user message, prefer the latest user message.
`.trim();
