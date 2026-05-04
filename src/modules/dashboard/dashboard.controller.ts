import { Response } from "express";
import { Request } from "express";
import { prisma } from "../../config/prisma";

export const getDashboard = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { country_id } = req.query as { country_id?: string };
    const countryWhere =
      country_id && country_id !== "all" ? { countryId: country_id } : {};
    const now = new Date();
    const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
      2,
      "0",
    )}`;
    const monthNum = now.getMonth() + 1;

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { financialYearStart: true },
    });

    if (!company) {
      res.status(404).json({ data: null, error: "Company not found" });
      return;
    }

    // Build country filter — if no country_id, include all countries

    // Total active controls
    const totalControls = await prisma.control.count({
      where: { companyId, status: "active", ...countryWhere },
    });

    // Controls due this month
    const allActiveControls = await prisma.control.findMany({
      where: {
        companyId,
        status: "active",
        ownerId: { not: null },
        ...countryWhere,
      },
      select: { frequency: true, testDueDay: true },
    });

    const controlsDueThisMonth = allActiveControls.filter((control: any) => {
      if (control.frequency === "monthly") return true;
      if (control.frequency === "annual")
        return monthNum === company.financialYearStart;
      if (control.frequency === "quarterly") {
        const diff = (monthNum - company.financialYearStart + 12) % 12;
        return diff % 3 === 0;
      }
      if (control.frequency === "semi_annually") {
        const diff = (monthNum - company.financialYearStart + 12) % 12;
        return diff % 6 === 0;
      }
      return false;
    }).length;

    // Test results for current period
    const testResults = await prisma.testResult.findMany({
      where: { companyId, period, ...countryWhere },
      select: { result: true, controlId: true },
    });

    const passCount = testResults.filter(
      (t: any) => t.result === "pass",
    ).length;
    const exceptionCount = testResults.filter(
      (t: any) => t.result === "exception",
    ).length;
    const failCount = testResults.filter(
      (t: any) => t.result === "fail",
    ).length;
    const totalTested = testResults.length;
    const passRate =
      totalTested > 0 ? Math.round((passCount / totalTested) * 100) : 0;

    // Overdue tests
    const testedIds = testResults.map((t: any) => t.controlId);
    const today = now.getDate();

    const untestedControls = await prisma.control.findMany({
      where: {
        companyId,
        status: "active",
        ownerId: { not: null },
        id: { notIn: testedIds.length > 0 ? testedIds : [""] },
        ...countryWhere,
      },
      select: { frequency: true, testDueDay: true },
    });

    const overdueCount = untestedControls.filter((control: any) => {
      const isDueThisMonth = (() => {
        if (control.frequency === "monthly") return true;
        if (control.frequency === "annual")
          return monthNum === company.financialYearStart;
        if (control.frequency === "quarterly") {
          const diff = (monthNum - company.financialYearStart + 12) % 12;
          return diff % 3 === 0;
        }
        if (control.frequency === "semi_annually") {
          const diff = (monthNum - company.financialYearStart + 12) % 12;
          return diff % 6 === 0;
        }
        return false;
      })();
      return isDueThisMonth && today > control.testDueDay;
    }).length;

    // Open issues
    const openIssues = await prisma.issue.findMany({
      where: { companyId, status: { not: "closed" }, ...countryWhere },
      select: { severity: true },
    });

    const openIssuesCount = openIssues.length;
    const criticalIssuesCount = openIssues.filter(
      (i: any) => i.severity === "high",
    ).length;

    // Pending actions
    const pendingActions = await prisma.action.findMany({
      where: { companyId, status: "in_progress" },
      select: { dueDate: true },
    });

    const pendingActionsCount = pendingActions.length;
    const overdueActionsCount = pendingActions.filter(
      (a: any) => a.dueDate && new Date(a.dueDate) < now,
    ).length;

    // Active users
    const activeUsers = await prisma.userCompany.findMany({
      where: { companyId },
      select: { role: true },
    });

    const activeUsersCount = activeUsers.length;
    const controlOwnersCount = activeUsers.filter(
      (u: any) => u.role === "control_owner",
    ).length;

    // Recent activity
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
    console.error("Dashboard error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
