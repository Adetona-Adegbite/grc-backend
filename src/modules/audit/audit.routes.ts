import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import { getAudit } from "./audit.controller";

const router = Router();

router.use(authenticate);

router.get("/", requireRole("admin", "control_owner", "tester"), getAudit);

export default router;
