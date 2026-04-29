import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import passport from "./config/passport";

import authRoutes from "./modules/auth/auth.routes";
import settingsRoutes from "./modules/settings/settings.routes";
import inviteRoutes from "./modules/invites/invites.routes";
import companyRoutes from "./modules/company/company.routes";
import testPlanRoutes from "./modules/testplan/testplan.routes";
import testingRoutes from "./modules/testing/testing.routes";
import issuesRoutes from "./modules/issues/issues.routes";
import actionsRoutes from "./modules/actions/actions.routes";
import dashboardRoutes from "./modules/dashboard/dashboard.routes";
import consolidatedRoutes from "./modules/consolidated/consolidated.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import auditRoutes from "./modules/audit/audit.routes";
import calendarRoutes from "./modules/calendar/calendar.routes";
import uploadRoutes from "./modules/uploads/uploads.routes";
import path from "path";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // generous for normal app usage
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    data: null,
    error: "Too many requests, please try again later",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // enough for retries, still blocks abuse
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // only count failed auth attempts
  message: {
    data: null,
    error: "Too many requests, please try again later",
  },
});

app.use(globalLimiter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(passport.initialize());

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/test-plan", testPlanRoutes);
app.use("/api/testing", testingRoutes);
app.use("/api/issues", issuesRoutes);
app.use("/api/actions", actionsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/consolidated", consolidatedRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/calendar", calendarRoutes);
app.use("/api/uploads", uploadRoutes);

app.use((_req, res) => {
  res.status(404).json({ data: null, error: "Route not found" });
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(err.stack);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
);

export default app;
