import { once } from "node:events";

export function setupSse(res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.socket?.setNoDelay?.(true);
  res.flushHeaders?.();
}

export async function writeSse(res, event, data, options = {}) {
  if (res.destroyed || res.writableEnded) {
    return false;
  }

  const lines = [];

  if (options.id) {
    lines.push(`id: ${options.id}`);
  }

  lines.push(`event: ${event}`);
  lines.push(`data: ${JSON.stringify(data)}`);
  lines.push("");

  try {
    const canContinue = res.write(`${lines.join("\n")}\n`);

    if (!canContinue) {
      await Promise.race([
        once(res, "drain"),
        once(res, "close"),
        once(res, "error")
      ]);
    }

    return !res.destroyed && !res.writableEnded;
  } catch {
    return false;
  }
}

export async function writeSseComment(res, comment) {
  if (res.destroyed || res.writableEnded) {
    return false;
  }

  try {
    const canContinue = res.write(`: ${comment}\n\n`);

    if (!canContinue) {
      await Promise.race([
        once(res, "drain"),
        once(res, "close"),
        once(res, "error")
      ]);
    }

    return !res.destroyed && !res.writableEnded;
  } catch {
    return false;
  }
}
