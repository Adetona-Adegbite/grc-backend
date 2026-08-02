import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import {
  getRequests,
  createRequest,
  replyToRequest,
  updateRequestStatus,
  deleteRequest,
} from "./requests.controller";

const router = Router();

router.use(authenticate);

// Testers and admins raise requests; control owners respond to their own.
const requesters = requireRole("admin", "tester");
const bothSides = requireRole("admin", "tester", "control_owner");

router.get("/", bothSides, getRequests);
router.post("/", requesters, createRequest);
router.post("/:id/messages", bothSides, replyToRequest);
router.patch("/:id/status", requesters, updateRequestStatus);
router.delete("/:id", requesters, deleteRequest);

export default router;
