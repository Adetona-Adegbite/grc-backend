import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import {
  getAudit,
  getFailedControls,
  getRecipients,
  createAudit,
  updateAudit,
  deleteAudit,
  addPeriodEvidence,
  createAuditComment,
  createAuditIssue,
  updateAuditIssue,
  deleteAuditIssue,
} from "./audit.controller";

const router = Router();

router.use(authenticate);

// Audits are carried out by testers (and admins). Control owners are
// responders: they can view and reply to audits addressed to them only, which
// is enforced per-record in the controller.
const auditors = requireRole("admin", "tester");
const auditorsAndResponders = requireRole("admin", "tester", "control_owner");

// Static paths must be registered before "/:id" style routes.
router.get("/failed-controls", auditors, getFailedControls);
router.get("/recipients", auditors, getRecipients);
router.get("/", auditorsAndResponders, getAudit);

router.post("/", auditors, createAudit);

// Audit-issue routes come before "/:id" so "issues" isn't read as an audit id.
router.patch("/issues/:issueId", auditors, updateAuditIssue);
router.delete("/issues/:issueId", auditors, deleteAuditIssue);

// Responders submit documents and reply, so these allow control owners too.
router.post(
  "/:id/periods/:period/evidence",
  auditorsAndResponders,
  addPeriodEvidence,
);
router.post("/:id/comments", auditorsAndResponders, createAuditComment);

router.post("/:id/periods/:period/issues", auditors, createAuditIssue);

router.patch("/:id", auditors, updateAudit);
router.delete("/:id", auditors, deleteAudit);

export default router;
