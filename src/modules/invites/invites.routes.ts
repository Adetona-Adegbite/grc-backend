import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import {
  sendInvite,
  acceptInvite,
  getInvites,
  revokeInvite,
} from "./invites.controller";

const router = Router();

router.post("/accept", acceptInvite);

router.get("/", authenticate, requireRole("admin"), getInvites);
router.post("/", authenticate, requireRole("admin"), sendInvite);
router.delete("/:id", authenticate, requireRole("admin"), revokeInvite);

export default router;
