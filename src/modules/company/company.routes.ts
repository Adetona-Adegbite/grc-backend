import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import {
  getCompanyMembers,
  getCompanyProfile,
  updateCompanyProfile,
  chooseSubscriptionPlan,
  activateSubscription,
} from "./company.controller";

const router = Router();

router.get("/members", authenticate, getCompanyMembers);

router.get("/profile", authenticate, getCompanyProfile);
router.put("/profile", authenticate, requireRole("admin"), updateCompanyProfile);

router.post(
  "/subscription",
  authenticate,
  requireRole("admin"),
  chooseSubscriptionPlan,
);
// Platform-operator only: authorised by the x-platform-key header, not a login.
router.post("/subscription/activate", activateSubscription);

export default router;
