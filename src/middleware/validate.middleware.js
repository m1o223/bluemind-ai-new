import { AppError } from "../utils/AppError.js";

function redactSensitive(value) {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactSensitive);
  }

  return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
    if (/password|token|code|secret/i.test(key)) {
      return [key, "[REDACTED]"];
    }

    return [key, redactSensitive(entry)];
  }));
}

export function validate(schema) {
  return (req, _res, next) => {
    const parsed = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query
    });

    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
        code: issue.code,
        received: issue.received,
        expected: issue.expected
      }));

      req.log?.warn({
        path: req.originalUrl,
        method: req.method,
        body: redactSensitive(req.body),
        params: req.params,
        query: req.query,
        issues,
        flattened: parsed.error.flatten()
      }, "Request validation failed");
      next(new AppError("Validation failed", 400, "VALIDATION_ERROR", parsed.error.flatten()));
      return;
    }

    req.validated = parsed.data;
    next();
  };
}
