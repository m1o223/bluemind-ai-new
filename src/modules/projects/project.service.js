import { AppError } from "../../utils/AppError.js";
import { Project } from "./project.model.js";

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
  return { projects: projects.map(toProjectResponse) };
}

export async function getUserProject(userId, projectId) {
  const project = await Project.findOne(activeProjectFilter(userId, projectId));
  if (!project) {
    throw new AppError("Project was not found", 404, "PROJECT_NOT_FOUND");
  }
  return { project: toProjectResponse(project) };
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
  project.deletedAt = new Date();
  await project.save();
  return { deleted: true, projectId: project._id.toString() };
}
