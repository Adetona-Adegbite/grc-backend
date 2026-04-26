import { Router, RequestHandler } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import { getCalendar } from "./calendar.controller";

const router = Router();

router.use(authenticate);

router.get("/", requireRole("admin", "control_owner"), getCalendar);

export default router;
