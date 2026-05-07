import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import { getMonthlyReport } from "./reports.controller";

const router = Router();

router.use(authenticate);

router.get(
  "/monthly",
  requireRole("admin", "control_owner", "viewer", "tester"),
  getMonthlyReport,
);

export default router;
