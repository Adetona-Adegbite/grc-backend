import { Response } from "express";
import { Request } from "express";
import { createIssueHelper } from "../../utils/createIssue";
import { prisma } from "../../config/prisma";
import { logAudit } from "../../utils/auditLog";

// Helper — generate test ID like T001, T002
const generateTestId = async (companyId: string): Promise<string> => {
  const count = await prisma.testResult.count({ where: { companyId } });
  return `T${String(count + 1).padStart(3, "0")}`;
};

export const getAvailableControls = async (
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

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { financialYearStart: true },
    });

    if (!company) {
      res.status(404).json({ data: null, error: "Company not found" });
      return;
    }

    // Build filter based on role
    const controlFilter: any = {
      companyId,
      ...countryWhere,
      status: "active",
      ownerId: { not: null },
    };

    if (role === "tester") {
      controlFilter.testerId = userId;
    } else if (role === "control_owner") {
      controlFilter.ownerId = userId;
    }

    const controls = await prisma.control.findMany({
      where: controlFilter,
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        tester: { select: { id: true, fullName: true, email: true } },
        testResults: {
          where: { companyId, ...countryWhere, period: month },
        },
        testPlanOverrides: {
          where: { companyId, period: month },
          include: {
            tester: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });

    const available = controls
      .filter((control: any) => {
        const [year, monthNum] = month.split("-").map(Number) as [
          number,
          number
        ];
        const diff = (monthNum - company.financialYearStart + 12) % 12;

        if (control.frequency === "monthly") return true;
        if (control.frequency === "quarterly") return diff % 3 === 0;
        if (control.frequency === "annual")
          return monthNum === company.financialYearStart;
        if (control.frequency === "as_needed") return false;
        return false;
      })
      .filter((control: any) => control.testResults.length === 0);

    const data = available.map((control: any) => {
      const override = control.testPlanOverrides[0] || null;
      const assignedTester = override ? override.tester : control.tester;

      return {
        id: control.id,
        controlId: control.controlId,
        name: control.name,
        domain: control.domain,
        frequency: control.frequency,
        owner: control.owner,
        assignedTester,
      };
    });

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const logTest = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const testerId = req.user!.userId;
    const {
      controlId,
      countryId,
      period,
      testName,
      population,
      sampleSize,
      exceptions,
      result,
      testProcedure,
      evidenceUrl,
      comments,
    } = req.body as {
      controlId: string;
      countryId: string;
      period: string;
      testName: string;
      population: number;
      sampleSize: number;
      exceptions: number;
      result: string;
      testProcedure?: string;
      evidenceUrl?: string;
      comments?: string;
    };
    console.log(
      controlId,
      countryId,
      period,
      testName,
      population,
      sampleSize,
      result
    );

    if (
      !controlId ||
      !countryId ||
      !period ||
      !testName ||
      !population ||
      !sampleSize ||
      !result
    ) {
      res
        .status(400)
        .json({ data: null, error: "All required fields must be provided" });
      return;
    }

    // Verify control belongs to company
    const control = await prisma.control.findFirst({
      where: { id: controlId, companyId },
    });

    if (!control) {
      res.status(404).json({ data: null, error: "Control not found" });
      return;
    }

    // Check not already tested this period
    const existing = await prisma.testResult.findUnique({
      where: { companyId_controlId_period: { companyId, controlId, period } },
    });

    if (existing) {
      res.status(409).json({
        data: null,
        error: "This control has already been tested this period",
      });
      return;
    }

    const testId = await generateTestId(companyId);

    const testResult = await prisma.testResult.create({
      data: {
        testId,
        companyId,
        countryId,
        controlId,
        testerId,
        period,
        testName,
        population: Number(population),
        sampleSize: Number(sampleSize),
        exceptions: Number(exceptions),
        result: result as any,
        ...(testProcedure !== undefined && { testProcedure }),
        ...(evidenceUrl !== undefined && { evidenceUrl }),
        ...(comments !== undefined && { comments }),
      },
    });

    // Auto create issue if result is exception or fail
    if (result === "exception" || result === "fail") {
      await createIssueHelper({
        companyId,
        countryId,
        controlId,
        testResultId: testResult.id,
        description: `Control ${control.controlId} — ${control.name} recorded a ${result} result for period ${period}.`,
        severity: result === "fail" ? "high" : "medium",
        ownerId: control.ownerId,
      });
    }
    await logAudit({
      companyId,
      userId: testerId,
      action: "Test completed",
      entityType: "test",
      entityId: testResult.id,
      detail: `${control.controlId} — ${
        testResult.result.charAt(0).toUpperCase() + testResult.result.slice(1)
      }`,
    });
    res.status(201).json({ data: testResult, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const getTestResults = async (
  req: Request,
  res: Response
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

    const results = await prisma.testResult.findMany({
      where: { companyId, ...countryWhere, period: month },
      include: {
        control: { select: { controlId: true, name: true, domain: true } },
        tester: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { testedAt: "desc" },
    });

    res.status(200).json({ data: results, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const getTestHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };

    const history = await prisma.testResult.findMany({
      where: { companyId, controlId: id },
      include: {
        tester: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { testedAt: "desc" },
    });

    res.status(200).json({ data: history, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
