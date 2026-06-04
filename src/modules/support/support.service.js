import { AppError } from "../../utils/AppError.js";
import { sendSupportIssueReport } from "../email/email.service.js";

function toEmailAttachment(file) {
  const match = String(file.dataUrl || "").match(/^data:([^;]+);base64,(.+)$/);

  if (!match) {
    throw new AppError("Attachment format is invalid", 400, "INVALID_SUPPORT_ATTACHMENT");
  }

  return {
    filename: file.name,
    content: match[2],
    encoding: "base64",
    contentType: file.type
  };
}

export async function createSupportIssueReport({ user, title, description, platform, appVersion, attachments }) {
  const timestamp = new Date().toISOString();

  await sendSupportIssueReport({
    user,
    title,
    description,
    platform,
    appVersion,
    timestamp,
    attachments: attachments.map(toEmailAttachment)
  });

  return {
    status: "sent",
    timestamp,
    supportEmail: "supportbluemindai@gmail.com"
  };
}
