import { Response } from "express";
import { Request } from "express";
import { prisma } from "../../config/prisma";

export const getDashboard = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { country_id } = req.query as { country_id: string };

    if (!country_id) {
      res.status(400).json({ data: null, error: "country_id is required" });
      return;
    }

    // Get current period YYYY-MM
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    const monthNum = now.getMonth() + 1;

    // Get company financial year start
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { financialYearStart: true },
    });

    if (!company) {
      res.status(404).json({ data: null, error: "Company not found" });
      return;
    }

    // Total active controls for this country
    const totalControls = await prisma.control.count({
      where: { companyId, countryId: country_id, status: "active" },
    });

    // Controls due this month
    const allActiveControls = await prisma.control.findMany({
      where: {
        companyId,
        countryId: country_id,
        status: "active",
        ownerId: { not: null },
      },
      select: { frequency: true, testDueDay: true },
    });

    const controlsDueThisMonth = allActiveControls.filter((control) => {
      if (control.frequency === "monthly") return true;
      if (control.frequency === "annual")
        return monthNum === company.financialYearStart;
      if (control.frequency === "quarterly") {
        const diff = (monthNum - company.financialYearStart + 12) % 12;
        return diff % 3 === 0;
      }
      return false;
    }).length;

    // Test results for current period
    const testResults = await prisma.testResult.findMany({
      where: { companyId, countryId: country_id, period },
      select: { result: true, controlId: true },
    });

    const passCount = testResults.filter((t) => t.result === "pass").length;
    const exceptionCount = testResults.filter(
      (t) => t.result === "exception"
    ).length;
    const failCount = testResults.filter((t) => t.result === "fail").length;
    const totalTested = testResults.length;
    const passRate =
      totalTested > 0 ? Math.round((passCount / totalTested) * 100) : 0;

    // Overdue tests
    const testedIds = testResults.map((t) => t.controlId);
    const today = now.getDate();

    const untestedControls = await prisma.control.findMany({
      where: {
        companyId,
        countryId: country_id,
        status: "active",
        ownerId: { not: null },
        id: { notIn: testedIds },
      },
      select: { frequency: true, testDueDay: true },
    });

    const overdueCount = untestedControls.filter((control) => {
      const isDueThisMonth = (() => {
        if (control.frequency === "monthly") return true;
        if (control.frequency === "annual")
          return monthNum === company.financialYearStart;
        if (control.frequency === "quarterly") {
          const diff = (monthNum - company.financialYearStart + 12) % 12;
          return diff % 3 === 0;
        }
        return false;
      })();
      return isDueThisMonth && today > control.testDueDay;
    }).length;

    // Open issues count + critical count
    const openIssues = await prisma.issue.findMany({
      where: { companyId, countryId: country_id, status: { not: "closed" } },
      select: { severity: true },
    });

    const openIssuesCount = openIssues.length;
    const criticalIssuesCount = openIssues.filter(
      (i) => i.severity === "high"
    ).length;

    // Pending actions count + overdue count
    const pendingActions = await prisma.action.findMany({
      where: { companyId, status: "in_progress" },
      select: { dueDate: true },
    });

    const pendingActionsCount = pendingActions.length;
    const overdueActionsCount = pendingActions.filter(
      (a) => a.dueDate && new Date(a.dueDate) < now
    ).length;

    // Active users count + control owners count
    const activeUsers = await prisma.userCompany.findMany({
      where: { companyId },
      select: { role: true },
    });

    const activeUsersCount = activeUsers.length;
    const controlOwnersCount = activeUsers.filter(
      (u) => u.role === "control_owner"
    ).length;

    // Recent activity from audit logs
    const recentActivity = await prisma.auditLog.findMany({
      where: { companyId },
      include: {
        user: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    res.status(200).json({
      data: {
        period,
        totalControls,
        controlsDueThisMonth,
        tested: totalTested,
        passCount,
        exceptionCount,
        failCount,
        passRate,
        overdueCount,
        openIssuesCount,
        criticalIssuesCount,
        pendingActionsCount,
        overdueActionsCount,
        activeUsersCount,
        controlOwnersCount,
        recentActivity,
      },
      error: null,
    });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
