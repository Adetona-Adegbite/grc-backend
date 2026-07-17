import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import {
  getAvailableControls,
  logTest,
  updateTest,
  getTestResults,
  getTestHistory,
} from "./testing.controller";

const router = Router();

router.use(authenticate);

router.get("/available", getAvailableControls);

router.post("/log", logTest);

// Testers can edit their own submissions; admins can edit any.
router.patch("/:id", requireRole("admin", "tester"), updateTest);

router.get("/results", getTestResults);

router.get("/history/:id", getTestHistory);

export default router;
