import express from "express";
import authRoutes from "./modules/auth/auth.routes";
import cookieParser from "cookie-parser";
import settingsRoutes from "./modules/settings/settings.routes";
import inviteRoutes from "./modules/invites/invites.routes";
import companyRoutes from "./modules/company/company.routes";
import testPlanRoutes from "./modules/testplan/testplan.routes";
import testingRoutes from "./modules/testing/testing.routes";
import actionsRoutes from "./modules/actions/actions.routes";
import issuesRoutes from "./modules/issues/issues.routes";
import consolidatedRoutes from "./modules/consolidated/consolidated.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import auditRoutes from "./modules/audit/audit.routes";
import calendarRoutes from "./modules/calendar/calendar.routes";
import passport from "./config/passport";

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(passport.initialize());

app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/test-plan", testPlanRoutes);
app.use("/api/testing", testingRoutes);
app.use("/api/actions", actionsRoutes);
app.use("/api/issues", issuesRoutes);
app.use("/api/consolidated", consolidatedRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/audit", auditRoutes);
app.use("/api/calendar", calendarRoutes);

export default app;
