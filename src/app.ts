import express from "express";
import authRoutes from "./modules/auth/auth.routes";
import cookieParser from "cookie-parser";
import settingsRoutes from "./modules/settings/settings.routes";
import inviteRoutes from "./modules/invites/invites.routes";
import companyRoutes from "./modules/company/company.routes";
import testPlanRoutes from "./modules/testplan/testplan.routes";

const app = express();

app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", authRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/invites", inviteRoutes);
app.use("/api/company", companyRoutes);
app.use("/api/test-plan", testPlanRoutes);
export default app;
