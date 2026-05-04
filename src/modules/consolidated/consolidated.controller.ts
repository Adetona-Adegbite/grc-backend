import { Response } from "express";
import { Request } from "express";
import { prisma } from "../../config/prisma";

export const getConsolidated = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { period, domain } = req.query as {
      period?: string;
      domain?: string;
    };

    // Default to current period if not provided
    const now = new Date();
    const currentPeriod =
      period ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

    // Get all countries for this company
    const countries = await prisma.country.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
    });

    // Get company financial year start
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { financialYearStart: true },
    });

    if (!company) {
      res.status(404).json({ data: null, error: "Company not found" });
      return;
    }

    const monthNum = new Date(`${currentPeriod}-01`).getMonth() + 1;

    // Build per country data
    const data = await Promise.all(
      countries.map(async (country: any) => {
        // Total active controls for this country
        const controlsFilter: any = {
          companyId,
          countryId: country.id,
          status: "active",
          ownerId: { not: null },
          ...(domain && { domain }),
        };

        const controls = await prisma.control.findMany({
          where: controlsFilter,
          select: { id: true, frequency: true },
        });

        // Filter controls due this period
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

        // Get test results for this country and period
        const testResults = await prisma.testResult.findMany({
          where: {
            companyId,
            countryId: country.id,
            period: currentPeriod,
            controlId: { in: dueControlIds },
          },
          select: { result: true },
        });

        const totalDue = dueControls.length;
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

        return {
          country: { id: country.id, name: country.name, code: country.code },
          totalDue,
          totalTested,
          passCount,
          exceptionCount,
          failCount,
          passRate,
          coverage:
            totalDue > 0 ? Math.round((totalTested / totalDue) * 100) : 0,
        };
      }),
    );

    // Aggregate totals
    const totals = data.reduce(
      (acc, row) => ({
        totalDue: acc.totalDue + row.totalDue,
        totalTested: acc.totalTested + row.totalTested,
        passCount: acc.passCount + row.passCount,
        exceptionCount: acc.exceptionCount + row.exceptionCount,
        failCount: acc.failCount + row.failCount,
        passRate:
          acc.totalTested + row.totalTested > 0
            ? Math.round(
                ((acc.passCount + row.passCount) /
                  (acc.totalTested + row.totalTested)) *
                  100,
              )
            : 0,
        coverage:
          acc.totalDue + row.totalDue > 0
            ? Math.round(
                ((acc.totalTested + row.totalTested) /
                  (acc.totalDue + row.totalDue)) *
                  100,
              )
            : 0,
      }),
      {
        totalDue: 0,
        totalTested: 0,
        passCount: 0,
        exceptionCount: 0,
        failCount: 0,
        passRate: 0,
        coverage: 0,
      },
    );

    res.status(200).json({
      data: {
        period: currentPeriod,
        rows: data,
        totals,
      },
      error: null,
    });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
