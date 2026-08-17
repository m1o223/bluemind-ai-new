import { Router } from "express";
import rateLimit from "express-rate-limit";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { validate } from "../../middleware/validate.middleware.js";
import {
  confirmChangeEmail,
  cancelDeleteAccount,
  firebaseGoogleLogin,
  forgotPassword,
  getDeleteStatus,
  getMe,
  guest,
  login,
  logout,
  requestChangeEmail,
  requestDeleteAccount,
  refresh,
  register,
  resendVerification,
  resetPasswordWithCode,
  updatePassword,
  updateProfile,
  verifyEmailCode,
  verifyPasswordReset,
  updatePreferences
} from "./auth.controller.js";
import {
  changeEmailConfirmSchema,
  changeEmailRequestSchema,
  changePasswordSchema,
  deleteAccountRequestSchema,
  forgotPasswordSchema,
  firebaseGoogleLoginSchema,
  loginSchema,
  logoutSchema,
  profileSchema,
  preferencesSchema,
  refreshSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyPasswordResetSchema,
  verifyEmailSchema
} from "./auth.validation.js";

const router = Router();
const authAttemptLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: "draft-7",
  legacyHeaders: false
});
const authCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipFailedRequests: true,
  handler(_req, res, _next, options) {
    res.status(options.statusCode).json({
      success: false,
      error: {
        code: "AUTH_CODE_RATE_LIMITED",
        message: "Too many code requests. Please wait a moment and try again."
      }
    });
  }
});

router.post("/register", authAttemptLimiter, validate(registerSchema), register);
router.post("/login", authAttemptLimiter, validate(loginSchema), login);
router.post("/firebase/google", authAttemptLimiter, validate(firebaseGoogleLoginSchema), firebaseGoogleLogin);
router.post("/guest", authAttemptLimiter, guest);
router.post("/verify-email", authCodeLimiter, validate(verifyEmailSchema), verifyEmailCode);
router.post("/resend-verification", authCodeLimiter, validate(resendVerificationSchema), resendVerification);
router.post("/forgot-password", authCodeLimiter, validate(forgotPasswordSchema), forgotPassword);
router.post("/verify-reset-code", authAttemptLimiter, validate(verifyPasswordResetSchema), verifyPasswordReset);
router.post("/reset-password", authAttemptLimiter, validate(resetPasswordSchema), resetPasswordWithCode);
router.post("/refresh", validate(refreshSchema), refresh);
router.post("/logout", validate(logoutSchema), logout);
router.get("/me", requireAuth, getMe);
router.patch("/profile", requireAuth, validate(profileSchema), updateProfile);
router.patch("/preferences", requireAuth, validate(preferencesSchema), updatePreferences);
router.post("/change-email/request", requireAuth, authCodeLimiter, validate(changeEmailRequestSchema), requestChangeEmail);
router.post("/change-email/confirm", requireAuth, authCodeLimiter, validate(changeEmailConfirmSchema), confirmChangeEmail);
router.post("/change-password", requireAuth, authAttemptLimiter, validate(changePasswordSchema), updatePassword);
router.get("/delete-status", requireAuth, getDeleteStatus);
router.post("/delete-request", requireAuth, authAttemptLimiter, validate(deleteAccountRequestSchema), requestDeleteAccount);
router.post("/delete-cancel", requireAuth, cancelDeleteAccount);

export default router;
