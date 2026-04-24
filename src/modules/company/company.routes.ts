import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import { getCompanyMembers } from "./company.controller";

const router = Router();

router.get("/members", authenticate, requireRole("admin"), getCompanyMembers);

export default router;
