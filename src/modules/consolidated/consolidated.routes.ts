import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import { getConsolidated } from "./consolidated.controller";

const router = Router();

router.use(authenticate);

router.get("/", requireRole("admin", "viewer", "tester"), getConsolidated);

export default router;
