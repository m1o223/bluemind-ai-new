import { Conversation } from "../memory/conversation.model.js";
import { ImageAsset } from "../images/image.model.js";
import { Project } from "../projects/project.model.js";

const clean = (value) => String(value || "").trim();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const snippet = (value, query) => {
  const source = clean(value).replace(/\s+/g, " ");
  const index = source.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  const start = Math.max(0, index < 0 ? 0 : index - 55);
  return `${start ? "…" : ""}${source.slice(start, start + 180)}${source.length > start + 180 ? "…" : ""}`;
};
const score = (title, body, query, updatedAt) => {
  const needle = query.toLocaleLowerCase();
  const normalizedTitle = clean(title).toLocaleLowerCase();
  const normalizedBody = clean(body).toLocaleLowerCase();
  const match = normalizedTitle === needle ? 1000 : normalizedTitle.startsWith(needle) ? 800 : normalizedTitle.includes(needle) ? 600 : normalizedBody.includes(needle) ? 300 : 0;
  const recency = Math.max(0, 100 - Math.floor((Date.now() - new Date(updatedAt || 0).getTime()) / 86400000));
  return match + recency;
};

export async function searchUserContent(userId, { q, type, limit }) {
  const regex = new RegExp(escapeRegex(q), "i");
  const wants = (name) => type === "all" || type === name;
  const jobs = [];

  if (wants("chats")) jobs.push(Conversation.find({ userId, privateSpaceId: { $exists: false }, deletedAt: { $exists: false }, $or: [{ title: regex }, { "messages.content": regex }, { summary: regex }] }).sort({ updatedAt: -1 }).limit(limit).lean().then((items) => items.map((item) => {
    const match = item.messages?.find((message) => regex.test(message.content || ""));
    const body = match?.content || item.summary || "BlueMind conversation";
    return { id: item._id.toString(), type: "chats", title: clean(item.title) || "Untitled chat", snippet: snippet(body, q), updatedAt: item.updatedAt, metadata: {} };
  })));

  if (wants("images") || wants("documents")) jobs.push(ImageAsset.find({ userId, status: "ready", $or: [{ originalName: regex }, { prompt: regex }, { revisedPrompt: regex }, { "analysis.description": regex }, { "analysis.extractedText": regex }] }).sort({ updatedAt: -1 }).limit(limit).lean().then((items) => items.map((item) => {
    const resultType = String(item.mimeType || "").startsWith("image/") ? "images" : "documents";
    return { id: item._id.toString(), type: resultType, title: clean(item.originalName || item.fileName) || (resultType === "images" ? "BlueMind image" : "Document"), snippet: snippet(item.prompt || item.analysis?.description || item.analysis?.extractedText || resultType.slice(0, -1), q), thumbnail: resultType === "images" ? `/api/images/${item._id}/file` : undefined, updatedAt: item.updatedAt, metadata: { mimeType: item.mimeType } };
  })));

  if (wants("projects")) jobs.push(Project.find({ userId, deletedAt: { $exists: false }, $or: [{ name: regex }, { description: regex }] }).sort({ updatedAt: -1 }).limit(limit).lean().then((items) => items.map((item) => ({ id: item._id.toString(), type: "projects", title: item.name, snippet: snippet(item.description || "Project", q), updatedAt: item.updatedAt, metadata: { chatCount: item.chatCount || 0, fileCount: item.fileCount || 0, taskCount: item.taskCount || 0 } }))));

  const results = (await Promise.all(jobs)).flat().filter((item) => wants(item.type));
  return { results: results.map((item) => ({ ...item, score: score(item.title, item.snippet, q, item.updatedAt) })).sort((a, b) => b.score - a.score || new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, limit).map(({ score: _score, ...item }) => item) };
}
