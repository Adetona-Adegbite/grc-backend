import { Router } from "express";
import { register, login, refresh, logout } from "./auth.controller";
import { googleCallback, completeGoogleRegistration } from "./auth.controller";
import passport from "../../config/passport";

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
  })
);
router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: "/login",
    session: false,
  }),
  googleCallback
);

// Complete Google registration
router.post("/google/complete", completeGoogleRegistration);

export default router;
