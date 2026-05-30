const STOP_WORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "you", "your", "are",
  "was", "were", "have", "has", "had", "but", "not", "what", "when", "where",
  "why", "how", "can", "could", "would", "should", "about", "into", "onto",
  "في", "من", "على", "عن", "إلى", "الى", "هذا", "هذه", "ذلك", "تلك", "ما",
  "ماذا", "كيف", "متى", "أين", "اين", "هل", "مع", "كان", "كانت"
]);

function tokenize(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function recencyScore(date) {
  if (!date) {
    return 0;
  }

  const ageMs = Date.now() - new Date(date).getTime();
  const ageDays = Math.max(ageMs / 86400000, 0);

  return Math.max(0, 1 - ageDays / 90);
}

export function rankMemories(memories, query, { limit = 8 } = {}) {
  const queryTokens = new Set(tokenize(query));

  return memories
    .map((memory) => {
      const memoryText = `${memory.key || ""} ${memory.content} ${(memory.tags || []).join(" ")}`;
      const memoryTokens = tokenize(memoryText);
      const overlap = memoryTokens.filter((token) => queryTokens.has(token)).length;
      const lexicalScore = queryTokens.size ? overlap / queryTokens.size : 0;
      const importance = Number(memory.importance || 0.5);
      const confidence = Number(memory.confidence || 0.7);
      const usage = Math.min(Number(memory.useCount || 0) / 10, 1);
      const recency = recencyScore(memory.lastUsedAt || memory.updatedAt || memory.createdAt);
      const pinnedBoost = memory.pinned ? 0.7 : 0;
      const profileBoost = ["profile", "preference", "instruction"].includes(memory.type) ? 0.25 : 0;
      const score = lexicalScore * 1.8
        + importance * 0.8
        + confidence * 0.35
        + recency * 0.25
        + usage * 0.1
        + pinnedBoost
        + profileBoost;

      return {
        memory,
        score,
        reasons: {
          lexicalScore,
          importance,
          confidence,
          recency,
          pinned: Boolean(memory.pinned),
          profile: profileBoost > 0
        }
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
