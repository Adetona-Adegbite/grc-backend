import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import {
  getIssues,
  getIssue,
  createIssue,
  updateIssue,
} from "./issues.controller";

const router = Router();

router.use(authenticate);

// Get all issues for a country
router.get("/", getIssues);

// Get single issue with actions
router.get("/:id", getIssue);

// Create manual issue — admin and control owner only
router.post("/", requireRole("admin", "control_owner"), createIssue);

// Update issue — admin and control owner only
router.put("/:id", requireRole("admin", "control_owner"), updateIssue);

export default router;
