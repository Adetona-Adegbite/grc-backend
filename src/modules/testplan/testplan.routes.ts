import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import { getTestPlan, overrideTester } from "./testplan.controller";

const router = Router();

// All test plan routes require authentication
router.use(authenticate);

// Get test plan — admin sees all, control owner and tester see their own
router.get("/", getTestPlan);

// Override tester — admin only
router.post("/override", requireRole("admin"), overrideTester);

export default router;
