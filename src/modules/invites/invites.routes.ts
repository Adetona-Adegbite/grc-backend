import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import {
  sendInvite,
  acceptInvite,
  getInvites,
  revokeInvite,
  getInviteByToken,
  declineInvite,
} from "./invites.controller";

const router = Router();
router.get("/:token", getInviteByToken);
router.post("/:token/accept", acceptInvite);
router.post("/:token/decline", declineInvite);

router.get("/", authenticate, requireRole("admin"), getInvites);
router.post("/", authenticate, requireRole("admin"), sendInvite);
router.delete("/:id", authenticate, requireRole("admin"), revokeInvite);

export default router;
