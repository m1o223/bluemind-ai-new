import { z } from "zod";
import { preferencesBodySchema } from "../preferences/preferences.validation.js";

const emailSchema = z.string().trim().email().max(160).transform((email) => email.toLowerCase());
const codeSchema = z.string().trim().regex(/^\d{6}$/, "Use the 6 digit code");
const birthdaySchema = z.union([
  z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  z.literal(""),
  z.null()
]);

const strongPasswordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/\d/, "Password must include a number");

export const registerSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(80),
    email: emailSchema,
    password: strongPasswordSchema
  }),
  params: z.object({}),
  query: z.object({})
});

export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1).max(128)
  }),
  params: z.object({}),
  query: z.object({})
});

export const verifyEmailSchema = z.object({
  body: z.object({
    email: emailSchema,
    code: codeSchema
  }),
  params: z.object({}),
  query: z.object({})
});

export const resendVerificationSchema = z.object({
  body: z.object({
    email: emailSchema
  }),
  params: z.object({}),
  query: z.object({})
});

export const forgotPasswordSchema = resendVerificationSchema;

export const resetPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
    code: codeSchema,
    password: strongPasswordSchema
  }),
  params: z.object({}),
  query: z.object({})
});

export const changeEmailRequestSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1).max(128),
    newEmail: emailSchema
  }),
  params: z.object({}),
  query: z.object({})
});

export const changeEmailConfirmSchema = z.object({
  body: z.object({
    code: codeSchema
  }),
  params: z.object({}),
  query: z.object({})
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1).max(128),
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().min(8).max(128)
  }).refine((body) => body.newPassword === body.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match"
  }),
  params: z.object({}),
  query: z.object({})
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().trim().min(1).optional()
  }).default({}),
  params: z.object({}),
  query: z.object({})
});

export const logoutSchema = refreshSchema;

export const preferencesSchema = z.object({
  body: preferencesBodySchema,
  params: z.object({}),
  query: z.object({})
});

export const profileSchema = z.object({
  body: z.object({
    birthday: birthdaySchema.optional(),
    avatarUrl: z.union([
      z.string().trim().max(900000),
      z.literal(""),
      z.null()
    ]).optional()
  }).refine((body) => Object.keys(body).length > 0, {
    message: "Profile update payload is required"
  }),
  params: z.object({}),
  query: z.object({})
});

export const googleCallbackSchema = z.object({
  body: z.object({}),
  params: z.object({}),
  query: z.object({
    code: z.string().trim().min(1),
    state: z.string().trim().min(1)
  })
});

export const firebaseGoogleLoginSchema = z.object({
  body: z.object({
    idToken: z.string().trim().min(20)
  }),
  params: z.object({}),
  query: z.object({})
});
