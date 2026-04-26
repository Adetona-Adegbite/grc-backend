import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import {
  getActions,
  createAction,
  updateAction,
  deleteAction,
} from "./actions.controller";

const router = Router();

router.use(authenticate);

// Get all actions — optionally filtered by issue
router.get("/", getActions);

// Create action — admin and control owner only
router.post("/", requireRole("admin", "control_owner"), createAction);

// Update action — admin and control owner only
router.put("/:id", requireRole("admin", "control_owner"), updateAction);

// Delete action — admin only
router.delete("/:id", requireRole("admin"), deleteAction);

export default router;
