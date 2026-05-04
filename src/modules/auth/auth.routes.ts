import { Router } from "express";
import {
  register,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  changePassword,
} from "./auth.controller";
import { googleCallback, completeGoogleRegistration } from "./auth.controller";
import passport from "../../config/passport";
import { authenticate } from "../../middleware/authenticate";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    session: false,
  }),
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login",
    session: false,
  }),
  googleCallback,
);

router.post("/google/complete", completeGoogleRegistration);

router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", authenticate, getProfile);
router.put("/me", authenticate, updateProfile);
router.put("/change-password", authenticate, changePassword);

export default router;
