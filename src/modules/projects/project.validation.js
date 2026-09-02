import { z } from "zod";

const projectId = z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid projectId");
const projectName = z.string().trim().min(1, "Project name is required").max(100);
const projectDescription = z.string().trim().max(500).default("");

const empty = z.object({}).strict();

export const listProjectsSchema = z.object({
  body: empty,
  params: empty,
  query: z.object({
    search: z.string().trim().max(100).optional()
  }).strict()
});

export const createProjectSchema = z.object({
  body: z.object({
    name: projectName,
    description: projectDescription.optional()
  }).strict(),
  params: empty,
  query: empty
});

export const projectParamsSchema = z.object({
  body: empty,
  params: z.object({ projectId }),
  query: empty
});

export const updateProjectSchema = z.object({
  body: z.object({
    name: projectName.optional(),
    description: z.string().trim().max(500).optional()
  }).strict().refine((value) => Object.keys(value).length > 0, {
    message: "At least one project field is required"
  }),
  params: z.object({ projectId }),
  query: empty
});
