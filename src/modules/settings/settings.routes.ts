import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import {
  getControls,
  createControl,
  updateControl,
  deleteControl,
  getCountries,
  createCountry,
  deleteCountry,
  updateCompany,
  getMembers,
  updateMemberRole,
  removeMember,
  getProcessOwners,
  reassignOwner,
} from "./settings.controller";

const router = Router();

// All settings routes require authentication + admin role
router.use(authenticate, requireRole("admin"));

// Controls
router.get("/controls", getControls);
router.post("/controls", createControl);
router.put("/controls/:id", updateControl);
router.delete("/controls/:id", deleteControl);

// Countries
router.get("/countries", getCountries);
router.post("/countries", createCountry);
router.delete("/countries/:id", deleteCountry);

// Company
router.put("/company", updateCompany);

router.get("/members", getMembers);
router.put("/members/:id/role", updateMemberRole);
router.delete("/members/:id", removeMember);

router.get("/process-owners", getProcessOwners);
router.put("/process-owners/:id", reassignOwner);

export default router;
