import { generateJson } from "../ai/ai.service.js";
import { getImage } from "../images/image.service.js";
import { assetToDataUrl } from "../images/image-storage.service.js";
import { getLanguageName, normalizePreferences } from "../preferences/preferences.service.js";

const timetableSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    detectedLanguage: { type: "string" },
    confidence: { type: "number" },
    summary: { type: "string" },
    days: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          key: { type: "string" },
          label: { type: "string" },
          originalLabel: { type: "string" }
        },
        required: ["key", "label", "originalLabel"]
      }
    },
    timeRange: {
      type: "object",
      additionalProperties: false,
      properties: {
        start: { type: "string" },
        end: { type: "string" }
      },
      required: ["start", "end"]
    },
    entries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          day: { type: "string" },
          startTime: { type: "string" },
          endTime: { type: "string" },
          subject: { type: "string" },
          originalText: { type: "string" },
          teacher: { type: "string" },
          room: { type: "string" },
          notes: { type: "string" },
          color: { type: "string" },
          type: { type: "string", enum: ["class", "lunch", "break", "dinner", "free_time", "unknown"] },
          durationMinutes: { type: "number" },
          confidence: { type: "number" },
          needsClarification: { type: "boolean" }
        },
        required: [
          "day",
          "startTime",
          "endTime",
          "subject",
          "originalText",
          "teacher",
          "room",
          "notes",
          "color",
          "type",
          "durationMinutes",
          "confidence",
          "needsClarification"
        ]
      }
    },
    clarificationQuestions: {
      type: "array",
      items: { type: "string" }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: [
    "detectedLanguage",
    "confidence",
    "summary",
    "days",
    "timeRange",
    "entries",
    "clarificationQuestions",
    "warnings"
  ]
};

const timetableInstructions = `
You are BlueMind AI's school timetable vision analyst.

Analyze the uploaded school schedule image and convert it into a faithful interactive timetable structure. Do not invent classes. If text, time, day, or block type is unclear, mark it with low confidence and add a clarification question.

Read:
- columns as weekdays
- rows as times
- merged/long blocks as longer duration entries
- lunch, rast, rest, break, dinner, free periods
- subject colors when visible
- teacher, room, and notes if present

Swedish timetable vocabulary:
- måndag = Monday, tisdag = Tuesday, onsdag = Wednesday, torsdag = Thursday, fredag = Friday
- Ma = Mathematics, Sv = Swedish, Eng = English, SO = Social studies, No/Te = Science / Technology
- Bild/Mu = Art / Music, Idrott = Physical Education, Slöjd = Crafts
- Lunch = Lunch, Middag/Dinner = Dinner, Rast = Break, Dusch = Shower, Elevens val = Student choice

Normalize day keys to monday, tuesday, wednesday, thursday, friday, saturday, sunday.
Normalize times to 24-hour HH:MM.
Use color hex values. Preserve subject colors when possible; otherwise choose a stable readable color.
The result must be useful for rendering a real timetable grid, not a generic task list.
`;

function cleanEntry(entry) {
  return {
    ...entry,
    color: /^#[0-9A-Fa-f]{6}$/.test(entry.color || "") ? entry.color : "#193B68",
    teacher: entry.teacher || "",
    room: entry.room || "",
    notes: entry.notes || "",
    confidence: Number.isFinite(entry.confidence) ? entry.confidence : 0.5,
    durationMinutes: Number.isFinite(entry.durationMinutes) ? entry.durationMinutes : 0,
    needsClarification: Boolean(entry.needsClarification)
  };
}

export async function analyzeSchoolTimetable({ userId, imageId, preferences, languageHint }) {
  const asset = await getImage(userId, imageId);
  const dataUrl = await assetToDataUrl(asset);
  const normalizedPreferences = normalizePreferences(preferences);
  const language = languageHint || normalizedPreferences.appLanguage;
  const languageName = getLanguageName(language);

  const result = await generateJson({
    name: "school_timetable_analysis",
    schema: timetableSchema,
    instructions: [
      timetableInstructions,
      `User app language: ${languageName} (${language}).`,
      "Keep subject names close to the source image, but expand common Swedish abbreviations when clear."
    ].join("\n\n"),
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: "Extract this school schedule image into a structured timetable. Return only the schema data."
          },
          {
            type: "input_image",
            image_url: dataUrl,
            detail: "high"
          }
        ]
      }
    ],
    temperature: 0.05
  });

  const timetable = {
    ...result.data,
    entries: (result.data.entries || []).map(cleanEntry)
  };

  asset.metadata = {
    ...(asset.metadata?.toObject?.() || asset.metadata || {}),
    timetableAnalysis: {
      analyzedAt: new Date(),
      detectedLanguage: timetable.detectedLanguage,
      confidence: timetable.confidence,
      entriesCount: timetable.entries.length,
      ai: result.metadata
    }
  };
  await asset.save();

  return {
    timetable,
    image: {
      id: asset._id.toString(),
      originalName: asset.originalName,
      url: `/api/images/${asset._id}/file`
    },
    ai: result.metadata
  };
}
