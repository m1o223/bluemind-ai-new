import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { openai } from "../../config/openai.js";
import { AppError } from "../../utils/AppError.js";
import { SYSTEM_PROMPT } from "./ai.prompt.js";

const AI_PROVIDER = "openai";

function toOpenAiInput(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content
  }));
}

function hasImageInput(messages) {
  return messages.some((message) => Array.isArray(message.content)
    && message.content.some((part) => part?.type === "input_image"));
}

function extractOutputText(response) {
  if (response?.output_text) {
    return response.output_text.trim();
  }

  return (response?.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("")
    .trim();
}

function buildRequest(messages, options = {}) {
  const model = options.model || (hasImageInput(messages) ? env.OPENAI_VISION_MODEL : env.OPENAI_MODEL);
  const requestOptions = { ...options };

  if (!requestOptions.reasoning) {
    delete requestOptions.reasoning;
  }

  return {
    model,
    instructions: SYSTEM_PROMPT,
    input: toOpenAiInput(messages),
    temperature: env.OPENAI_TEMPERATURE,
    ...requestOptions
  };
}

function parseJsonOutput(content) {
  const cleaned = content
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

function buildMetadata(response) {
  return {
    provider: AI_PROVIDER,
    model: response?.model || env.OPENAI_MODEL,
    responseId: response?.id,
    status: response?.status,
    usage: response?.usage,
    incompleteDetails: response?.incomplete_details,
    error: response?.error
  };
}

function buildRequestDiagnostics(request, messages) {
  const input = Array.isArray(messages) ? messages : [];
  return {
    provider: AI_PROVIDER,
    model: request.model,
    stream: Boolean(request.stream),
    inputMessages: input.length,
    hasImageInput: hasImageInput(input),
    maxOutputTokens: request.max_output_tokens,
    temperature: request.temperature
  };
}

function buildProviderErrorDiagnostics(error) {
  return {
    provider: AI_PROVIDER,
    providerStatus: error?.status,
    providerCode: error?.code,
    providerType: error?.type,
    providerParam: error?.param,
    providerMessage: error?.message,
    requestId: error?.request_id || error?.requestID
  };
}

function toAiError(error) {
  if (error instanceof AppError) {
    return error;
  }

  const details = {
    providerStatus: error?.status,
    providerCode: error?.code,
    providerType: error?.type,
    providerParam: error?.param,
    providerMessage: error?.message
  };

  if (error?.name === "APIUserAbortError" || error?.name === "AbortError") {
    return new AppError("AI stream was aborted", 499, "AI_STREAM_ABORTED");
  }

  if (error?.status === 429) {
    return new AppError("AI provider rate limit reached", 429, "AI_RATE_LIMITED", details);
  }

  if (error?.status === 401 || error?.status === 403) {
    return new AppError("AI provider authentication failed", 503, "AI_PROVIDER_AUTH_FAILED", details);
  }

  if (error?.status && error.status >= 400 && error.status < 500) {
    return new AppError("AI provider rejected the request", 502, "AI_PROVIDER_REQUEST_FAILED", details);
  }

  return new AppError("AI provider request failed", 502, "AI_PROVIDER_ERROR", details);
}

function toStreamEventError(event) {
  if (event.type === "error") {
    return new AppError(event.message || "AI stream event failed", 502, "AI_STREAM_EVENT_ERROR", {
      providerCode: event.code,
      providerParam: event.param
    });
  }

  if (event.type === "response.failed") {
    return new AppError("AI provider failed while streaming", 502, "AI_STREAM_FAILED", buildMetadata(event.response));
  }

  return new AppError("AI provider returned an incomplete stream", 502, "AI_STREAM_INCOMPLETE", buildMetadata(event.response));
}

export async function generateReply(messages, options = {}) {
  const request = buildRequest(messages, options);
  const diagnostics = buildRequestDiagnostics(request, messages);

  try {
    logger.info(diagnostics, "OpenAI response request started");
    const response = await openai.responses.create(request);
    const content = extractOutputText(response);

    if (!content) {
      throw new AppError("AI provider returned an empty response", 502, "AI_EMPTY_RESPONSE");
    }

    logger.info({
      ...diagnostics,
      response: buildMetadata(response),
      outputChars: content.length
    }, "OpenAI response request completed");

    return {
      content,
      metadata: buildMetadata(response)
    };
  } catch (error) {
    logger.error({
      ...diagnostics,
      err: error,
      providerError: buildProviderErrorDiagnostics(error)
    }, "OpenAI response request failed");
    throw toAiError(error);
  }
}

export async function generateJson({ instructions, input, schema, name, temperature = 0.2, model, maxOutputTokens }) {
  const request = {
    model: model || (hasImageInput(input) ? env.OPENAI_VISION_MODEL : env.OPENAI_MODEL),
    instructions,
    input,
    temperature,
    text: {
      format: {
        type: "json_schema",
        name,
        schema,
        strict: false
      }
    }
  };

  if (maxOutputTokens) {
    request.max_output_tokens = maxOutputTokens;
  }

  const diagnostics = buildRequestDiagnostics(request, input);

  try {
    logger.info(buildRequestDiagnostics(request, input), "OpenAI JSON request started");
    const response = await openai.responses.create(request);
    const content = extractOutputText(response);

    if (!content) {
      throw new AppError("AI provider returned an empty JSON response", 502, "AI_EMPTY_RESPONSE");
    }

    logger.info({
      ...diagnostics,
      response: buildMetadata(response),
      outputChars: content.length
    }, "OpenAI JSON request completed");

    return {
      data: parseJsonOutput(content),
      metadata: buildMetadata(response)
    };
  } catch (error) {
    logger.error({
      ...diagnostics,
      err: error,
      providerError: buildProviderErrorDiagnostics(error)
    }, "OpenAI JSON request failed");

    if (error instanceof SyntaxError) {
      throw new AppError("AI provider returned invalid JSON", 502, "AI_INVALID_JSON");
    }

    throw toAiError(error);
  }
}

export async function streamReply(messages, { signal, onDelta, onResponseStart, aiOptions } = {}) {
  let content = "";
  let responseMetadata;
  let tokenIndex = 0;
  const request = buildRequest(messages, {
    ...(aiOptions || {}),
    stream: true
  });
  const diagnostics = buildRequestDiagnostics(request, messages);

  try {
    logger.info(diagnostics, "OpenAI stream request started");
    const stream = await openai.responses.create(request, {
      signal
    });

    for await (const event of stream) {
      if (signal?.aborted) {
        throw new AppError("AI stream was aborted", 499, "AI_STREAM_ABORTED");
      }

      if (event.type === "response.created") {
        responseMetadata = buildMetadata(event.response);
        await onResponseStart?.(responseMetadata);
      }

      if (event.type === "response.output_text.delta" && event.delta) {
        content += event.delta;
        tokenIndex += 1;

        await onDelta?.({
          token: event.delta,
          index: tokenIndex,
          sequenceNumber: event.sequence_number
        });
      }

      if (event.type === "response.output_text.done" && !content && event.text) {
        content = event.text;
      }

      if (event.type === "response.completed") {
        responseMetadata = buildMetadata(event.response || {});

        if (!content) {
          content = extractOutputText(event.response);
        }
      }

      if (event.type === "response.failed" || event.type === "response.incomplete" || event.type === "error") {
        throw toStreamEventError(event);
      }
    }

    content = content.trim();

    if (!content) {
      throw new AppError("AI provider returned an empty response", 502, "AI_EMPTY_RESPONSE");
    }

    logger.info({
      ...diagnostics,
      response: responseMetadata,
      outputChars: content.length,
      tokensReceived: tokenIndex
    }, "OpenAI stream request completed");

    return {
      content,
      metadata: responseMetadata || {
        provider: AI_PROVIDER,
        model: env.OPENAI_MODEL
      }
    };
  } catch (error) {
    logger.error({
      ...diagnostics,
      err: error,
      providerError: buildProviderErrorDiagnostics(error),
      partialOutputChars: content.trim().length,
      tokensReceived: tokenIndex,
      response: responseMetadata
    }, "OpenAI stream request failed");

    const aiError = toAiError(error);
    const partialContent = content.trim();

    if (aiError.code === "AI_STREAM_ABORTED" && partialContent) {
      return {
        content: partialContent,
        metadata: {
          ...(responseMetadata || {
            provider: AI_PROVIDER,
            model: env.OPENAI_MODEL
          }),
          status: "aborted",
          aborted: true
        }
      };
    }

    throw aiError;
  }
}
