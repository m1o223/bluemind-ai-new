import zlib from "node:zlib";

import { generateJson } from "../ai/ai.service.js";
import { getLanguageName, normalizePreferences } from "../preferences/preferences.service.js";

const MAX_EXTRACTED_CHARS = 28000;

const scheduleDocumentSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    documentType: { type: "string" },
    scheduleKind: { type: "string" },
    classification: { type: "string" },
    summary: { type: "string" },
    structure: { type: "string" },
    extractedText: { type: "string" },
    scheduleText: { type: "string" },
    events: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          day: { type: "string" },
          date: { type: "string" },
          weekNumber: { type: "number" },
          weekYear: { type: "number" },
          start: { type: "string" },
          end: { type: "string" },
          title: { type: "string" },
          label: { type: "string" },
          category: { type: "string" },
          sourceCell: { type: "string" },
          confidence: { type: "number" },
          notes: { type: "string" }
        },
        required: ["day", "date", "start", "end", "title", "label", "category", "sourceCell", "confidence", "notes"]
      }
    },
    warnings: {
      type: "array",
      items: { type: "string" }
    }
  },
  required: ["documentType", "scheduleKind", "classification", "summary", "structure", "extractedText", "scheduleText", "events", "warnings"]
};

function extensionOf(fileName = "") {
  const match = String(fileName).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || "";
}

function detectDocumentType({ mimeType = "", originalName = "" }) {
  const extension = extensionOf(originalName);
  const mime = String(mimeType || "").toLowerCase();

  if (mime.includes("pdf") || extension === "pdf") return "pdf";
  if (mime.includes("spreadsheetml") || extension === "xlsx") return "xlsx";
  if (mime.includes("excel") || extension === "xls") return "xls";
  if (mime.includes("wordprocessingml") || extension === "docx") return "docx";
  if (mime.includes("msword") || extension === "doc") return "doc";
  if (mime.includes("csv") || extension === "csv") return "csv";
  if (mime.includes("rtf") || extension === "rtf") return "rtf";
  if (mime.startsWith("text/") || ["txt", "tsv", "md"].includes(extension)) return "text";
  return extension || "document";
}

function cleanText(value = "", maxLength = MAX_EXTRACTED_CHARS) {
  return String(value || "")
    .replace(/\u0000/g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, maxLength);
}

function decodeXml(value = "") {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function extractXmlText(xml = "") {
  return [...String(xml || "").matchAll(/<[^:>]*:?t\b[^>]*>([\s\S]*?)<\/[^:>]*:?t>/g)]
    .map((match) => decodeXml(match[1]))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPrintableText(buffer) {
  const utf8 = buffer.toString("utf8");
  const latin1 = buffer.toString("latin1");
  const candidate = utf8.replace(/\uFFFD/g, "").trim().length >= latin1.replace(/[^\x20-\x7E]/g, "").trim().length
    ? utf8
    : latin1;
  return cleanText(candidate.replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\uFFFF]+/g, " "));
}

function findEndOfCentralDirectory(buffer) {
  const minimumOffset = Math.max(0, buffer.length - 66000);
  for (let index = buffer.length - 22; index >= minimumOffset; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) {
      return index;
    }
  }
  return -1;
}

function readZipEntries(buffer) {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset === -1) return new Map();

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = new Map();
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) break;

    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const fileName = buffer.toString("utf8", offset + 46, offset + 46 + fileNameLength);

    if (localHeaderOffset + 30 <= buffer.length && buffer.readUInt32LE(localHeaderOffset) === 0x04034b50) {
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressedData = buffer.subarray(dataStart, dataStart + compressedSize);

      try {
        const data = compressionMethod === 0
          ? compressedData
          : compressionMethod === 8
            ? zlib.inflateRawSync(compressedData)
            : null;
        if (data) entries.set(fileName.replace(/\\/g, "/"), data);
      } catch {
        // Skip unreadable entries and keep parsing the rest of the document.
      }
    }

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function parseDocx(buffer) {
  const entries = readZipEntries(buffer);
  const documentXml = entries.get("word/document.xml")?.toString("utf8") || "";
  if (!documentXml) return extractPrintableText(buffer);

  const lines = [];
  const tableMatches = [...documentXml.matchAll(/<w:tbl[\s\S]*?<\/w:tbl>/g)];
  for (const [tableIndex, tableMatch] of tableMatches.entries()) {
    lines.push(`Table ${tableIndex + 1}:`);
    const rows = [...tableMatch[0].matchAll(/<w:tr[\s\S]*?<\/w:tr>/g)];
    rows.forEach((rowMatch, rowIndex) => {
      const cells = [...rowMatch[0].matchAll(/<w:tc[\s\S]*?<\/w:tc>/g)]
        .map((cellMatch) => extractXmlText(cellMatch[0]))
        .filter(Boolean);
      if (cells.length) {
        lines.push(`| ${cells.join(" | ")} |`);
      } else {
        lines.push(`Row ${rowIndex + 1}:`);
      }
    });
  }

  const paragraphs = [...documentXml.matchAll(/<w:p[\s\S]*?<\/w:p>/g)]
    .map((match) => extractXmlText(match[0]))
    .filter(Boolean);

  return cleanText([...paragraphs, ...lines].join("\n"));
}

function columnIndex(cellReference = "") {
  const letters = String(cellReference).match(/^[A-Z]+/i)?.[0]?.toUpperCase() || "";
  return letters.split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function parseXlsx(buffer) {
  const entries = readZipEntries(buffer);
  const sharedXml = entries.get("xl/sharedStrings.xml")?.toString("utf8") || "";
  const sharedStrings = [...sharedXml.matchAll(/<si[\s\S]*?<\/si>/g)].map((match) => extractXmlText(match[0]));
  const workbookXml = entries.get("xl/workbook.xml")?.toString("utf8") || "";
  const sheetNames = [...workbookXml.matchAll(/<sheet\b[^>]*name="([^"]+)"[^>]*sheetId="(\d+)"/g)]
    .reduce((map, match) => {
      map.set(`xl/worksheets/sheet${match[2]}.xml`, decodeXml(match[1]));
      return map;
    }, new Map());

  const worksheetEntries = [...entries.entries()]
    .filter(([name]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
    .sort(([left], [right]) => left.localeCompare(right));
  const output = [];

  worksheetEntries.forEach(([name, data], sheetIndex) => {
    const xml = data.toString("utf8");
    output.push(`Sheet: ${sheetNames.get(name) || `Sheet ${sheetIndex + 1}`}`);

    const mergeRefs = [...xml.matchAll(/<mergeCell\b[^>]*ref="([^"]+)"/g)].map((match) => match[1]);
    if (mergeRefs.length) output.push(`Merged cells: ${mergeRefs.join(", ")}`);

    const rows = [...xml.matchAll(/<row\b[\s\S]*?<\/row>/g)];
    rows.forEach((rowMatch) => {
      const cells = [];
      for (const cellMatch of rowMatch[0].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attributes = cellMatch[1];
        const body = cellMatch[2];
        const reference = attributes.match(/\br="([^"]+)"/)?.[1] || "";
        const type = attributes.match(/\bt="([^"]+)"/)?.[1] || "";
        const value = body.match(/<v>([\s\S]*?)<\/v>/)?.[1] || "";
        const inlineText = extractXmlText(body);
        const text = type === "s"
          ? sharedStrings[Number(value)] || ""
          : type === "inlineStr"
            ? inlineText
            : decodeXml(value || inlineText);
        const index = Math.max(0, columnIndex(reference));
        cells[index] = cleanText(text, 400);
      }

      const lastIndex = cells.reduce((last, cell, index) => (cell ? index : last), -1);
      if (lastIndex >= 0) {
        output.push(`| ${cells.slice(0, lastIndex + 1).map((cell) => cell || "").join(" | ")} |`);
      }
    });
  });

  return cleanText(output.join("\n"));
}

function decodePdfLiteralString(value = "") {
  return String(value || "")
    .slice(1, -1)
    .replace(/\\([nrtbf()\\])/g, (_match, escaped) => ({
      n: "\n",
      r: "\r",
      t: "\t",
      b: "\b",
      f: "\f",
      "(": "(",
      ")": ")",
      "\\": "\\"
    })[escaped] || escaped)
    .replace(/\\([0-7]{1,3})/g, (_match, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
}

function extractPdfTextFromChunk(chunk) {
  const text = String(chunk || "");
  const literals = [...text.matchAll(/\((?:\\.|[^\\)]){1,500}\)/g)]
    .map((match) => decodePdfLiteralString(match[0]))
    .filter((value) => /[A-Za-z0-9]/.test(value));
  const hexStrings = [...text.matchAll(/<([0-9A-Fa-f\s]{4,})>/g)]
    .map((match) => {
      const hex = match[1].replace(/\s+/g, "");
      if (hex.length % 2 !== 0) return "";
      return Buffer.from(hex, "hex").toString("utf8");
    })
    .filter((value) => /[A-Za-z0-9]/.test(value));
  return [...literals, ...hexStrings].join("\n");
}

function parsePdf(buffer) {
  const latin1 = buffer.toString("latin1");
  const chunks = [latin1];

  for (const match of latin1.matchAll(/stream\r?\n?([\s\S]*?)\r?\n?endstream/g)) {
    const dictionary = latin1.slice(Math.max(0, match.index - 600), match.index);
    const streamBuffer = Buffer.from(match[1].replace(/^\r?\n/, "").replace(/\r?\n$/, ""), "latin1");
    if (!/FlateDecode/.test(dictionary)) {
      chunks.push(streamBuffer.toString("latin1"));
      continue;
    }

    try {
      chunks.push(zlib.inflateSync(streamBuffer).toString("latin1"));
    } catch {
      try {
        chunks.push(zlib.inflateRawSync(streamBuffer).toString("latin1"));
      } catch {
        // Some PDF streams are image/font data or use unsupported filters.
      }
    }
  }

  const extracted = chunks.map(extractPdfTextFromChunk).filter(Boolean).join("\n");
  return cleanText(extracted || extractPrintableText(buffer));
}

function extractDocumentText({ buffer, documentType }) {
  if (["text", "csv", "rtf"].includes(documentType)) {
    return extractPrintableText(buffer);
  }

  if (documentType === "pdf") {
    return parsePdf(buffer);
  }

  if (documentType === "docx") {
    return parseDocx(buffer);
  }

  if (documentType === "xlsx") {
    return parseXlsx(buffer);
  }

  return extractPrintableText(buffer);
}

function buildScheduleLines(events = []) {
  return events
    .filter((event) => event.day && event.start && event.end && (event.label || event.title))
    .map((event) => {
      const datePrefix = event.date ? `${event.date} | ` : "";
      return `SCHEDULE_IMPORT: ${datePrefix}${event.day} | ${event.start} | ${event.end} | ${event.label || event.title}`;
    })
    .join("\n");
}

function buildDocumentInstructions(preferences) {
  const normalizedPreferences = normalizePreferences(preferences);
  const languageName = getLanguageName(normalizedPreferences.language);

  return [
    "You are BlueMind AI's document-aware schedule analyst.",
    "The user uploaded a timetable, roster, calendar, spreadsheet, PDF, Word document, image-derived text, or other schedule-like document.",
    `Today's date is ${new Date().toISOString().slice(0, 10)}. Use it only for resolving missing years when the source clearly implies the current year.`,
    "Automatically detect the document type and schedule type. The user should not need to explain what the file is.",
    "Understand structure before extracting events: rows, columns, ISO week number, calendar dates, weekdays, time ranges, merged cells, recurring events, breaks, lunch, empty cells, and reading order.",
    "Reconstruct the timetable exactly as the original document describes it. Preserve day/time/activity mapping and original order.",
    "Every event must include the real ISO date in YYYY-MM-DD when the document provides or implies it. If the source uses compact dates such as 260727, interpret them as YYMMDD and convert them to 2026-07-27.",
    "Detect the ISO week number and week-year for dated schedules. For example, Monday 2026-07-27 belongs to ISO Week 31 of 2026.",
    "Events must not overlap unless the source document actually contains overlapping events.",
    "If merged cells span multiple rows or slots, use the first covered start time and the final covered end time.",
    "Categorize each event as Education, Work, Fitness, Nutrition, Personal, Break, Travel, Health, Home, or Other.",
    "Generate clean professional labels. Examples: Mathematics=Math, Physical Education=PE, English=Eng, Science=Sci, Swedish=Swe, Biology=Bio, Chemistry=Chem, History=Hist, Geography=Geo, Lunch=Lunch, Break=Break.",
    "Return one event per real schedule block. Do not duplicate empty cells. Do not invent times or days that are not supported by the document.",
    "If a day/date or time is ambiguous, include a warning and set confidence lower.",
    "scheduleText must contain one import line per event in exactly this date-aware format: SCHEDULE_IMPORT: 2026-07-27 | Monday | 09:00 | 09:50 | Math",
    `The user's preferred language is ${languageName} (${normalizedPreferences.language}), but weekday names in scheduleText must be English Monday through Sunday and times must be 24-hour HH:MM.`
  ].join("\n");
}

function fallbackAnalysis({ documentType, extractedText }) {
  return {
    documentType,
    scheduleKind: "unknown",
    classification: "unclear",
    summary: extractedText ? "Document text was extracted, but structured AI schedule analysis was unavailable." : "No readable text could be extracted from this document.",
    structure: "Best-effort text extraction only.",
    extractedText,
    scheduleText: "",
    events: [],
    warnings: ["Document analysis could not generate structured schedule events."]
  };
}

export async function analyzeScheduleDocumentBuffer({ buffer, mimeType, originalName, preferences }) {
  const documentType = detectDocumentType({ mimeType, originalName });
  const extractedText = extractDocumentText({ buffer, documentType });
  const extractionHeader = [
    `File name: ${originalName}`,
    `Detected file type: ${documentType}`,
    `MIME type: ${mimeType}`,
    "",
    "Extracted document structure/text:",
    extractedText || "No readable text extracted."
  ].join("\n");

  let analysis;
  let aiMetadata = {};

  try {
    const result = await generateJson({
      name: "schedule_document_analysis",
      schema: scheduleDocumentSchema,
      instructions: buildDocumentInstructions(preferences),
      input: [
        {
          role: "user",
          content: extractionHeader
        }
      ],
      temperature: 0.1,
      maxOutputTokens: 7000
    });
    analysis = result.data;
    aiMetadata = result.metadata;
  } catch {
    analysis = fallbackAnalysis({ documentType, extractedText });
  }

  const eventLines = buildScheduleLines(analysis.events || []);
  const scheduleText = [analysis.scheduleText, eventLines]
    .filter(Boolean)
    .join("\n")
    .trim();

  return {
    document: {
      originalName,
      mimeType,
      sizeBytes: buffer.length,
      detectedType: documentType,
      extractedText
    },
    analysis: {
      ...analysis,
      documentType: analysis.documentType || documentType,
      extractedText: analysis.extractedText || extractedText,
      scheduleText,
      events: Array.isArray(analysis.events) ? analysis.events : [],
      warnings: Array.isArray(analysis.warnings) ? analysis.warnings : [],
      ai: aiMetadata
    }
  };
}
