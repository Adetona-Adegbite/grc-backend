import { Response } from "express";
import { Request } from "express";
import { prisma } from "../../config/prisma";

// Helper — generate recommendations
const generateRecommendations = (
  passRate: number,
  exceptionCount: number,
  openIssuesCount: number,
  coverage: number,
): string[] => {
  const recommendations: string[] = [];

  if (passRate < 80) {
    recommendations.push(
      "⚠ Pass rate of " + passRate + "% is below acceptable threshold.",
    );
  }
  if (exceptionCount > 0) {
    recommendations.push("💡 Exceptions noted. Review and document rationale.");
  }
  if (openIssuesCount > 0) {
    recommendations.push("💡 Open issues require attention.");
  }
  if (coverage < 100) {
    recommendations.push("✅ Control coverage needs improvement.");
  }

  return recommendations;
};

export const getMonthlyReport = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { country_id, month } = req.query as {
      country_id?: string;
      month: string;
    };
    const countryWhere =
      country_id && country_id !== "all" ? { countryId: country_id } : {};

    if (!country_id || !month) {
      res
        .status(400)
        .json({ data: null, error: "country_id and month are required" });
      return;
    }

    // Get company financial year start
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { financialYearStart: true, name: true },
    });

    if (!company) {
      res.status(404).json({ data: null, error: "Company not found" });
      return;
    }
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      res
        .status(400)
        .json({ data: null, error: "Invalid month format. Use YYYY-MM" });
      return;
    }

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr!, 10);
    const monthNum = parseInt(monthStr!, 10);

    if (isNaN(year) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      res.status(400).json({ data: null, error: "Invalid month value" });
      return;
    }

    const periodStart = new Date(Date.UTC(year, monthNum - 1, 1));
    const periodEnd = new Date(Date.UTC(year, monthNum, 1));

    // Get all active controls due this month for this country
    const controls = await prisma.control.findMany({
      where: {
        companyId,
        ...countryWhere,
        status: "active",
        ownerId: { not: null },
      },
      select: { id: true, frequency: true, domain: true },
    });

    const dueControls = controls.filter((control: any) => {
      if (control.frequency === "monthly") return true;
      if (control.frequency === "annual")
        return monthNum === company.financialYearStart;
      if (control.frequency === "quarterly") {
        const diff = (monthNum - company.financialYearStart + 12) % 12;
        return diff % 3 === 0;
      }
      return false;
    });

    const dueControlIds = dueControls.map((c: any) => c.id);
    const totalDue = dueControls.length;

    // Get test results for this period
    const testResults = await prisma.testResult.findMany({
      where: {
        companyId,
        ...countryWhere,
        period: month,
        controlId: { in: dueControlIds },
      },
      include: {
        control: {
          select: {
            controlId: true,
            name: true,
            domain: true,
          },
        },
        tester: { select: { fullName: true, email: true } },
      },
      orderBy: { testedAt: "asc" },
    });

    // Header metrics
    const totalTests = testResults.length;
    const passCount = testResults.filter(
      (t: any) => t.result === "pass",
    ).length;
    const exceptionCount = testResults.filter(
      (t: any) => t.result === "exception",
    ).length;
    const failCount = testResults.filter(
      (t: any) => t.result === "fail",
    ).length;
    const passRate =
      totalTests > 0 ? Math.round((passCount / totalTests) * 100) : 0;
    const coverage =
      totalDue > 0 ? Math.round((totalTests / totalDue) * 100) : 0;

    // Group by domain
    const domainMap: Record<
      string,
      {
        totalTests: number;
        passCount: number;
        exceptionCount: number;
        failCount: number;
      }
    > = {};

    testResults.forEach((t: any) => {
      const domain = t.control.domain;
      if (!domainMap[domain]) {
        domainMap[domain] = {
          totalTests: 0,
          passCount: 0,
          exceptionCount: 0,
          failCount: 0,
        };
      }
      domainMap[domain]!.totalTests += 1;
      if (t.result === "pass") domainMap[domain]!.passCount += 1;
      if (t.result === "exception") domainMap[domain]!.exceptionCount += 1;
      if (t.result === "fail") domainMap[domain]!.failCount += 1;
    });

    const byDomain = Object.entries(domainMap).map(([domain, stats]) => ({
      domain,
      ...stats,
      progress:
        stats.totalTests > 0
          ? Math.round((stats.passCount / stats.totalTests) * 100)
          : 0,
    }));

    // Detailed test results
    const detailedResults = testResults.map((t: any) => ({
      testDate: t.testedAt,
      controlId: t.control.controlId,
      controlName: t.control.name,
      domain: t.control.domain,
      tester: t.tester,
      sampleSize: t.sampleSize,
      exceptions: t.exceptions,
      result: t.result,
      evidenceUrl: t.evidenceUrl,
    }));

    const issues = await prisma.issue.findMany({
      where: {
        companyId,
        ...countryWhere,
        createdAt: {
          gte: periodStart,
          lt: periodEnd,
        },
      },
      include: {
        control: { select: { controlId: true } },
        owner: { select: { fullName: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    const issuesData = issues.map((i: any) => ({
      issueId: i.issueId,
      controlId: i.control.controlId,
      description: i.description,
      severity: i.severity,
      status: i.status,
      owner: i.owner,
      dueDate: i.dueDate,
    }));

    // Recommendations
    const recommendations = generateRecommendations(
      passRate,
      exceptionCount,
      issues.length,
      coverage,
    );

    res.status(200).json({
      data: {
        period: month,
        company: company.name,
        metrics: {
          totalTests,
          passCount,
          exceptionCount,
          failCount,
          passRate,
          coverage,
        },
        byDomain,
        detailedResults,
        issues: issuesData,
        recommendations,
      },
      error: null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
