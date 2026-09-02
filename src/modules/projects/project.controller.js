import { asyncHandler } from "../../utils/asyncHandler.js";
import { sendResponse } from "../../utils/sendResponse.js";
import {
  createUserProject,
  deleteUserProject,
  getUserProject,
  listUserProjects,
  updateUserProject
} from "./project.service.js";

export const listProjects = asyncHandler(async (req, res) => {
  sendResponse(res, 200, await listUserProjects(req.user._id, req.validated.query));
});

export const getProject = asyncHandler(async (req, res) => {
  sendResponse(res, 200, await getUserProject(req.user._id, req.validated.params.projectId));
});

export const createProject = asyncHandler(async (req, res) => {
  sendResponse(res, 201, await createUserProject(req.user._id, req.validated.body), "Project created");
});

export const updateProject = asyncHandler(async (req, res) => {
  sendResponse(res, 200, await updateUserProject(
    req.user._id,
    req.validated.params.projectId,
    req.validated.body
  ), "Project updated");
});

export const deleteProject = asyncHandler(async (req, res) => {
  sendResponse(res, 200, await deleteUserProject(
    req.user._id,
    req.validated.params.projectId
  ), "Project deleted");
});
