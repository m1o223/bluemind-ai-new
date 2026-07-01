import { toFile } from "openai";

import { env } from "../../config/env.js";
import { openai } from "../../config/openai.js";
import { AppError } from "../../utils/AppError.js";

const SUPPORTED_AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/ogg;codecs=opus",
]);

function getAudioExtension(contentType = "") {
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("mpeg") || contentType.includes("mp3")) return "mp3";
  if (contentType.includes("wav")) return "wav";
  if (contentType.includes("ogg")) return "ogg";
  return "webm";
}

function toVoiceProviderError(error, fallbackMessage, code) {
  if (error instanceof AppError) return error;

  const details = {
    providerStatus: error?.status,
    providerCode: error?.code,
    providerType: error?.type,
    providerMessage: error?.message,
  };

  if (error?.status === 401 || error?.status === 403) {
    return new AppError("Voice provider authentication failed", 503, "VOICE_PROVIDER_AUTH_FAILED", details);
  }

  if (error?.status === 429) {
    return new AppError("Voice provider rate limit reached", 429, "VOICE_PROVIDER_RATE_LIMITED", details);
  }

  return new AppError(fallbackMessage, 502, code, details);
}

export async function transcribeAudio({ buffer, contentType }) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 512) {
    throw new AppError("Empty audio or no speech detected", 400, "VOICE_EMPTY_AUDIO");
  }

  const normalizedType = String(contentType || "audio/webm").toLowerCase();
  if (![...SUPPORTED_AUDIO_TYPES].some((type) => normalizedType.startsWith(type))) {
    throw new AppError("Unsupported audio format", 415, "VOICE_UNSUPPORTED_AUDIO", { contentType });
  }

  if (buffer.length > env.VOICE_AUDIO_MAX_BYTES) {
    throw new AppError("Voice recording is too large", 413, "VOICE_AUDIO_TOO_LARGE", {
      maxBytes: env.VOICE_AUDIO_MAX_BYTES,
    });
  }

  try {
    const file = await toFile(buffer, `voice-input.${getAudioExtension(normalizedType)}`, {
      type: normalizedType,
    });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: env.OPENAI_TRANSCRIPTION_MODEL,
    });
    const text = String(transcription?.text || "").trim();

    if (!text) {
      throw new AppError("No speech was detected", 400, "VOICE_NO_SPEECH");
    }

    return {
      text,
      model: env.OPENAI_TRANSCRIPTION_MODEL,
    };
  } catch (error) {
    throw toVoiceProviderError(error, "Transcription failed", "VOICE_TRANSCRIPTION_FAILED");
  }
}

export async function synthesizeSpeech({ text }) {
  const cleanText = String(text || "").trim();

  if (!cleanText) {
    throw new AppError("No text was provided for voice generation", 400, "VOICE_TEXT_REQUIRED");
  }

  try {
    const audio = await openai.audio.speech.create({
      model: env.OPENAI_TTS_MODEL,
      voice: env.OPENAI_TTS_VOICE,
      input: cleanText.slice(0, 4000),
      response_format: "mp3",
    });

    return {
      buffer: Buffer.from(await audio.arrayBuffer()),
      contentType: "audio/mpeg",
      model: env.OPENAI_TTS_MODEL,
      voice: env.OPENAI_TTS_VOICE,
    };
  } catch (error) {
    throw toVoiceProviderError(error, "Voice generation failed", "VOICE_GENERATION_FAILED");
  }
}
