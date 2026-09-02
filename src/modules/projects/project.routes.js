import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  updateProject
} from "./project.controller.js";
import {
  createProjectSchema,
  listProjectsSchema,
  projectParamsSchema,
  updateProjectSchema
} from "./project.validation.js";

const router = Router();

router.use(requireAuth);
router.get("/", validate(listProjectsSchema), listProjects);
router.post("/", validate(createProjectSchema), createProject);
router.get("/:projectId", validate(projectParamsSchema), getProject);
router.patch("/:projectId", validate(updateProjectSchema), updateProject);
router.delete("/:projectId", validate(projectParamsSchema), deleteProject);

export default router;
