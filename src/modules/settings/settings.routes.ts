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
  getDomains,
  getCompany,
} from "./settings.controller";

const router = Router();

router.get("/countries", authenticate, getCountries);
router.get(
  "/controls",
  authenticate,
  requireRole("admin", "tester", "control_owner"),
  getControls,
);
router.post(
  "/controls",
  authenticate,
  requireRole("admin", "tester", "control_owner"),
  createControl,
);
router.put(
  "/controls/:id",
  authenticate,
  requireRole("admin", "tester", "control_owner"),
  updateControl,
);
router.delete(
  "/controls/:id",
  authenticate,
  requireRole("admin", "tester", "control_owner"),
  deleteControl,
);
router.get(
  "/domains",
  authenticate,
  requireRole("admin", "tester"),
  getDomains,
);
router.get(
  "/members",
  authenticate,
  requireRole("admin", "tester"),
  getMembers,
);
router.get(
  "/process-owners",
  authenticate,
  requireRole("admin", "tester", "control_owner"),
  getProcessOwners,
);

// All settings routes require authentication + admin role
router.use(authenticate, requireRole("admin"));

// Countries
router.post("/countries", createCountry);
router.delete("/countries/:id", deleteCountry);

// Company
router.put("/company", updateCompany);
router.get("/company", getCompany);

router.put("/members/:id/role", updateMemberRole);
router.delete("/members/:id", removeMember);

router.put("/process-owners/:id", reassignOwner);

export default router;
