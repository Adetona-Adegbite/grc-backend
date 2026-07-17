import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import {
  getAudit,
  getFailedControls,
  createAudit,
  updateAudit,
  deleteAudit,
  addPeriodEvidence,
  createAuditIssue,
  updateAuditIssue,
  deleteAuditIssue,
} from "./audit.controller";

const router = Router();

router.use(authenticate);

// Audits are for admins and control owners only.
const auditRoles = requireRole("admin", "control_owner");

// Static path must be registered before "/:id" style routes.
router.get("/failed-controls", auditRoles, getFailedControls);
router.get("/", auditRoles, getAudit);

router.post("/", auditRoles, createAudit);

// Audit-issue routes come before "/:id" so "issues" isn't read as an audit id.
router.patch("/issues/:issueId", auditRoles, updateAuditIssue);
router.delete("/issues/:issueId", auditRoles, deleteAuditIssue);

router.post("/:id/periods/:period/evidence", auditRoles, addPeriodEvidence);
router.post("/:id/periods/:period/issues", auditRoles, createAuditIssue);

router.patch("/:id", auditRoles, updateAudit);
router.delete("/:id", auditRoles, deleteAudit);

export default router;
