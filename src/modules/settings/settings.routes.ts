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

export default router;
