import { Router } from "express";
import { authenticate, requireRole } from "../../middleware/authenticate";
import {
  getAvailableControls,
  logTest,
  getTestResults,
  getTestHistory,
} from "./testing.controller";

const router = Router();

router.use(authenticate);

router.get("/available", getAvailableControls);

router.post("/log", logTest);

router.get("/results", getTestResults);

router.get("/history/:id", getTestHistory);

export default router;
