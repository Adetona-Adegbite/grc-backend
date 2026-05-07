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

router.post("/", requireRole("admin", "control_owner", "tester"), createIssue);

router.put(
  "/:id",
  requireRole("admin", "control_owner", "tester"),
  updateIssue,
);

export default router;
