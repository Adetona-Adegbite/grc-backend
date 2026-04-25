import { Router, RequestHandler } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import { getCalendar } from "./calendar.controller";

const router = Router();

router.use(authenticate as unknown as RequestHandler);

router.get(
  "/",
  requireRole("admin", "control_owner") as unknown as RequestHandler,
  getCalendar
);

export default router;
