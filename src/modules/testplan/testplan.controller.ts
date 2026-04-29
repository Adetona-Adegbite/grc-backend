import { Response } from "express";
import { Request } from "express";
import { prisma } from "../../config/prisma";

// Helper — checks if a control is due in a given month
const isControlDue = (
  frequency: string,
  period: string,
  financialYearStart: number
): boolean => {
  const [year, month] = period.split("-").map(Number);
  const monthIndex = month || 0; // 1-12

  if (frequency === "monthly") return true;

  if (frequency === "annual") {
    return monthIndex === financialYearStart;
  }

  if (frequency === "quarterly") {
    // Quarterly months are every 3 months from financial year start
    const diff = (monthIndex - financialYearStart + 12) % 12;
    return diff % 3 === 0;
  }

  if (frequency === "as_needed") return false;

  return false;
};

// Helper — get last day of a month
const getLastDayOfMonth = (period: string): string => {
  const [year, month] = period.split("-").map(Number) as [number, number];
  const lastDay = new Date(year, month, 0).getDate();
  return `${period}-${String(lastDay).padStart(2, "0")}`;
};

// Helper - get due date using testDueDay
const getDueDate = (period: string, testDueDay: number): string => {
  const [year, month] = period.split("-").map(Number) as [number, number];
  const lastDay = new Date(year, month, 0).getDate();
  const day = Math.min(testDueDay, lastDay);
  return `${period}-${String(day).padStart(2, "0")}`;
};

export const getTestPlan = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const role = req.user!.role;
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

    // Validate month format YYYY-MM
    if (!/^\d{4}-\d{2}$/.test(month)) {
      res
        .status(400)
        .json({ data: null, error: "Invalid month format. Use YYYY-MM" });
      return;
    }

    // Get company financial year start
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { financialYearStart: true },
    });

    if (!company) {
      res.status(404).json({ data: null, error: "Company not found" });
      return;
    }

    // Build control filter based on role
    const controlFilter: any = {
      companyId,
      ...countryWhere,
      status: "active",
      ownerId: { not: null },
    };

    if (role === "control_owner") {
      controlFilter.ownerId = userId;
    } else if (role === "tester") {
      controlFilter.testerId = userId;
    }

    // Fetch active controls for this country
    const controls = await prisma.control.findMany({
      where: controlFilter,
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        tester: { select: { id: true, fullName: true, email: true } },
        testPlanOverrides: {
          where: { companyId, period: month },
          include: {
            tester: { select: { id: true, fullName: true, email: true } },
          },
        },
        testResults: {
          where: { companyId, ...countryWhere, period: month },
        },
      },
    });

    // Filter controls that are due this month
    const dueControls = controls.filter((control: any) =>
      isControlDue(control.frequency, month, company.financialYearStart)
    );

    // Build test plan entries
    const testPlan = dueControls.map((control: any) => {
      const override = control.testPlanOverrides[0] || null;
      const testResult = control.testResults[0] || null;
      const assignedTester = override ? override.tester : control.tester;

      return {
        controlId: control.controlId,
        name: control.name,
        domain: control.domain,
        frequency: control.frequency,
        nature: control.nature,
        type: control.type,
        owner: control.owner,
        assignedTester,
        dueDate: getDueDate(month, control.testDueDay),
        status: testResult ? testResult.result : "pending",
        testResult: testResult
          ? {
              population: testResult.population,
              sampleSize: testResult.sampleSize,
              exceptions: testResult.exceptions,
              result: testResult.result,
              evidenceUrl: testResult.evidenceUrl,
              testedAt: testResult.testedAt,
            }
          : null,
      };
    });

    res.status(200).json({ data: testPlan, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const overrideTester = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { control_id, tester_id, period } = req.body as {
      control_id: string;
      tester_id: string;
      period: string;
    };

    if (!control_id || !tester_id || !period) {
      res.status(400).json({
        data: null,
        error: "control_id, tester_id and period are required",
      });
      return;
    }

    // Verify control belongs to company
    const control = await prisma.control.findFirst({
      where: { id: control_id, companyId },
    });

    if (!control) {
      res.status(404).json({ data: null, error: "Control not found" });
      return;
    }

    // Verify tester belongs to company
    const testerMembership = await prisma.userCompany.findFirst({
      where: { userId: tester_id, companyId },
    });

    if (!testerMembership) {
      res
        .status(404)
        .json({ data: null, error: "Tester not found in company" });
      return;
    }

    const override = await prisma.testPlanOverride.upsert({
      where: {
        companyId_controlId_period: {
          companyId,
          controlId: control_id,
          period,
        },
      },
      update: { testerId: tester_id },
      create: { companyId, controlId: control_id, testerId: tester_id, period },
    });

    res.status(200).json({ data: override, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
