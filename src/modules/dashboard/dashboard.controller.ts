import { Response } from "express";
import { Request } from "express";
import { prisma } from "../../config/prisma";

export const getDashboard = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const role = req.user!.role;
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

    // ─── TESTER DASHBOARD ───────────────────────────────────────────────────
    if (role === "tester") {
      const assignedTests = await prisma.testResult.findMany({
        where: { companyId, testerId: userId, ...countryWhere },
        select: { result: true, period: true, controlId: true },
      });

      const currentPeriodTests = assignedTests.filter(
        (t: any) => t.period === period,
      );
      const passCount = currentPeriodTests.filter(
        (t: any) => t.result === "pass",
      ).length;
      const failCount = currentPeriodTests.filter(
        (t: any) => t.result === "fail",
      ).length;
      const exceptionCount = currentPeriodTests.filter(
        (t: any) => t.result === "exception",
      ).length;
      const totalTested = currentPeriodTests.length;
      const passRate =
        totalTested > 0 ? Math.round((passCount / totalTested) * 100) : 0;

      const issues = await prisma.issue.findMany({
        where: {
          companyId,
          ownerId: userId,
          ...countryWhere,
        },
        select: {
          severity: true,
          status: true,
          testerClosed: true,
        },
      });

      const openIssues = issues.filter(
        (i) => i.status !== "closed" && !i.testerClosed,
      );

      const closedIssues = issues.filter((i) => i.status === "closed");

      const pendingConfirmationIssues = issues.filter(
        (i) => i.testerClosed === true && i.status !== "closed",
      );

      const pendingActions = await prisma.action.findMany({
        where: { companyId, ownerId: userId, status: "in_progress" },
        select: { dueDate: true },
      });

      const overdueActionsCount = pendingActions.filter(
        (a: any) => a.dueDate && new Date(a.dueDate) < now,
      ).length;

      const recentActivity = await prisma.auditLog.findMany({
        where: { companyId },
        include: { user: { select: { fullName: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      res.status(200).json({
        data: {
          role,
          period,
          totalAssignedTests: assignedTests.length,
          currentPeriodTests: totalTested,
          passCount,
          failCount,
          exceptionCount,
          passRate,
          openIssuesCount: openIssues.length,

          closedIssuesCount: closedIssues.length,

          pendingConfirmationCount: pendingConfirmationIssues.length,

          criticalIssuesCount: openIssues.filter(
            (i: any) => i.severity === "high",
          ).length,
          pendingActionsCount: pendingActions.length,
          overdueActionsCount,
          recentActivity,
        },
        error: null,
      });
      return;
    }

    // ─── CONTROL OWNER DASHBOARD ────────────────────────────────────────────
    if (role === "control_owner") {
      const myControls = await prisma.control.findMany({
        where: {
          companyId,
          ownerId: userId,
          status: "active",
          ...countryWhere,
        },
        select: { id: true, frequency: true, testDueDay: true },
      });

      const myControlIds = myControls.map((c: any) => c.id);

      const controlsDueThisMonth = myControls.filter((control: any) => {
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

      const testResults = await prisma.testResult.findMany({
        where: {
          companyId,
          period,
          controlId: { in: myControlIds.length > 0 ? myControlIds : [""] },
          ...countryWhere,
        },
        select: { result: true, controlId: true },
      });

      const passCount = testResults.filter(
        (t: any) => t.result === "pass",
      ).length;
      const totalTested = testResults.length;
      const passRate =
        totalTested > 0 ? Math.round((passCount / totalTested) * 100) : 0;

      const testedIds = testResults.map((t: any) => t.controlId);
      const today = now.getDate();

      const untestedControls = myControls.filter(
        (c: any) => !testedIds.includes(c.id),
      );

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

      const openIssues = await prisma.issue.findMany({
        where: {
          companyId,
          controlId: { in: myControlIds.length > 0 ? myControlIds : [""] },
          status: { not: "closed" },
          ...countryWhere,
        },
        select: { severity: true },
      });

      const pendingActions = await prisma.action.findMany({
        where: { companyId, ownerId: userId, status: "in_progress" },
        select: { dueDate: true },
      });

      const overdueActionsCount = pendingActions.filter(
        (a: any) => a.dueDate && new Date(a.dueDate) < now,
      ).length;

      const recentActivity = await prisma.auditLog.findMany({
        where: { companyId, userId },
        include: { user: { select: { fullName: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 10,
      });

      res.status(200).json({
        data: {
          role,
          period,
          totalControls: myControls.length,
          controlsDueThisMonth,
          overdueCount,
          passCount,
          passRate,
          openIssuesCount: openIssues.length,
          criticalIssuesCount: openIssues.filter(
            (i: any) => i.severity === "high",
          ).length,
          pendingActionsCount: pendingActions.length,
          overdueActionsCount,
          recentActivity,
        },
        error: null,
      });
      return;
    }

    // ─── VIEWER DASHBOARD ───────────────────────────────────────────────────
    if (role === "viewer") {
      const totalControls = await prisma.control.count({
        where: { companyId, status: "active", ...countryWhere },
      });

      const testResults = await prisma.testResult.findMany({
        where: { companyId, period, ...countryWhere },
        select: { result: true },
      });

      const passCount = testResults.filter(
        (t: any) => t.result === "pass",
      ).length;
      const totalTested = testResults.length;
      const passRate =
        totalTested > 0 ? Math.round((passCount / totalTested) * 100) : 0;

      const openIssues = await prisma.issue.findMany({
        where: { companyId, status: { not: "closed" }, ...countryWhere },
        select: { severity: true },
      });

      res.status(200).json({
        data: {
          role,
          period,
          totalControls,
          passRate,
          passCount,
          totalTested,
          openIssuesCount: openIssues.length,
          criticalIssuesCount: openIssues.filter(
            (i: any) => i.severity === "high",
          ).length,
        },
        error: null,
      });
      return;
    }

    // ─── ADMIN DASHBOARD (unchanged) ────────────────────────────────────────
    const totalControls = await prisma.control.count({
      where: { companyId, status: "active", ...countryWhere },
    });

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

    const openIssues = await prisma.issue.findMany({
      where: { companyId, status: { not: "closed" }, ...countryWhere },
      select: { severity: true },
    });

    const pendingActions = await prisma.action.findMany({
      where: { companyId, status: "in_progress" },
      select: { dueDate: true },
    });

    const activeUsers = await prisma.userCompany.findMany({
      where: { companyId },
      select: { role: true },
    });

    const recentActivity = await prisma.auditLog.findMany({
      where: { companyId },
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    res.status(200).json({
      data: {
        role,
        period,
        totalControls,
        controlsDueThisMonth,
        tested: totalTested,
        passCount,
        exceptionCount,
        failCount,
        passRate,
        overdueCount,
        openIssuesCount: openIssues.length,
        criticalIssuesCount: openIssues.filter(
          (i: any) => i.severity === "high",
        ).length,
        pendingActionsCount: pendingActions.length,
        overdueActionsCount: pendingActions.filter(
          (a: any) => a.dueDate && new Date(a.dueDate) < now,
        ).length,
        activeUsersCount: activeUsers.length,
        controlOwnersCount: activeUsers.filter(
          (u: any) => u.role === "control_owner",
        ).length,
        recentActivity,
      },
      error: null,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
