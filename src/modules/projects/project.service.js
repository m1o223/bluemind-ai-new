import { AppError } from "../../utils/AppError.js";
import { Project } from "./project.model.js";
import { Conversation } from "../memory/conversation.model.js";

const MAX_PROJECTS_PER_USER = 100;

function toProjectResponse(project) {
  return {
    id: project._id.toString(),
    userId: project.userId.toString(),
    name: project.name,
    description: project.description || "",
    chatCount: project.chatCount || 0,
    fileCount: project.fileCount || 0,
    taskCount: project.taskCount || 0,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

function activeProjectFilter(userId, projectId) {
  return {
    ...(projectId ? { _id: projectId } : {}),
    userId,
    deletedAt: { $exists: false }
  };
}

export async function listUserProjects(userId, { search } = {}) {
  const filter = activeProjectFilter(userId);
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [
      { name: { $regex: escaped, $options: "i" } },
      { description: { $regex: escaped, $options: "i" } }
    ];
  }
  const projects = await Project.find(filter).sort({ updatedAt: -1, _id: -1 });
  const counts = projects.length ? await Conversation.aggregate([
    { $match: { userId, projectId: { $in: projects.map((project) => project._id) }, deletedAt: { $exists: false }, "messages.0": { $exists: true } } },
    { $group: { _id: "$projectId", count: { $sum: 1 } } }
  ]) : [];
  const countByProject = new Map(counts.map((item) => [item._id.toString(), item.count]));
  return { projects: projects.map((project) => ({ ...toProjectResponse(project), chatCount: countByProject.get(project._id.toString()) || 0 })) };
}

export async function getUserProject(userId, projectId) {
  const project = await Project.findOne(activeProjectFilter(userId, projectId));
  if (!project) {
    throw new AppError("Project was not found", 404, "PROJECT_NOT_FOUND");
  }
  const chatCount = await Conversation.countDocuments({ userId, projectId: project._id, deletedAt: { $exists: false }, "messages.0": { $exists: true } });
  return { project: { ...toProjectResponse(project), chatCount } };
}

export async function createUserProject(userId, input) {
  const count = await Project.countDocuments(activeProjectFilter(userId));
  if (count >= MAX_PROJECTS_PER_USER) {
    throw new AppError("Project limit reached", 400, "PROJECT_LIMIT_REACHED");
  }
  const project = await Project.create({
    userId,
    name: input.name,
    description: input.description || ""
  });
  return { project: toProjectResponse(project) };
}

export async function updateUserProject(userId, projectId, input) {
  const project = await Project.findOne(activeProjectFilter(userId, projectId));
  if (!project) {
    throw new AppError("Project was not found", 404, "PROJECT_NOT_FOUND");
  }
  if (input.name !== undefined) project.name = input.name;
  if (input.description !== undefined) project.description = input.description;
  await project.save();
  return { project: toProjectResponse(project) };
}

export async function deleteUserProject(userId, projectId) {
  const project = await Project.findOne(activeProjectFilter(userId, projectId));
  if (!project) {
    throw new AppError("Project was not found", 404, "PROJECT_NOT_FOUND");
  }
  await Conversation.updateMany(
    { userId, projectId, deletedAt: { $exists: false } },
    { $unset: { projectId: 1 } }
  );
  project.deletedAt = new Date();
  await project.save();
  return { deleted: true, projectId: project._id.toString() };
}
