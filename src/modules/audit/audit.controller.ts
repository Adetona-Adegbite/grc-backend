import { Response } from "express";
import { Request } from "express";
import { prisma } from "../../config/prisma";
import { logAudit } from "../../utils/auditLog";
import {
  MONTH_NAMES,
  isControlDueInMonth,
  buildFinancialYearMonths,
  dueDateFor,
} from "../../utils/schedule";

// An audit is raised off a control that has failing test results. Both
// "exception" and "fail" count: fail is the higher-severity of the two, so
// excluding it would hide the worst findings from the audit tab.
const FAILED_RESULTS = ["exception", "fail"] as const;

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Next id based on the MAX existing number (not a count) so deleted rows don't
// cause "AUD-00x already exists" collisions.
const nextSequentialId = async (
  tx: any,
  model: "audit" | "auditIssue",
  field: "auditId" | "auditIssueId",
  prefix: string,
  companyId: string,
  offset = 0,
) => {
  const rows = await tx[model].findMany({
    where: { companyId },
    select: { [field]: true },
  });
  let max = 0;
  for (const row of rows) {
    const n = parseInt(String(row[field]).replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}-${String(max + 1 + offset).padStart(3, "0")}`;
};

const isIdClash = (err: any, field: string) => {
  const target = err?.meta?.target;
  return (
    err?.code === "P2002" &&
    (Array.isArray(target)
      ? target.includes(field)
      : String(target ?? "").includes(field))
  );
};

// An "as_needed" control never appears on the calendar, so its audit is a
// one-off falling due in its start month. Without this it would have no due
// period at all and could never take evidence or issues.
const isOneOff = (frequency: string) => frequency === "as_needed";

const oneOffPeriod = (startMonth: string, dueDay: number) => {
  const year = parseInt(startMonth.slice(0, 4), 10);
  const monthNum = parseInt(startMonth.slice(5, 7), 10);
  return [
    {
      period: startMonth,
      month: MONTH_NAMES[monthNum - 1] as string,
      monthNum,
      year,
      dueDate: dueDateFor(year, monthNum, dueDay),
    },
  ];
};

// The periods an audit falls due in: the months its control is already
// scheduled for, from the audit's start month onward.
const duePeriodsFor = (
  frequency: string,
  financialYearStart: number,
  startMonth: string,
  dueDay: number,
  year: number,
) => {
  if (isOneOff(frequency)) return oneOffPeriod(startMonth, dueDay);

  return buildFinancialYearMonths(financialYearStart, year)
    .filter(
      (m) =>
        isControlDueInMonth(frequency, m.monthNum, financialYearStart) &&
        m.period >= startMonth,
    )
    .map((m) => ({
      period: m.period,
      month: m.month,
      monthNum: m.monthNum,
      year: m.year,
      dueDate: dueDateFor(m.year, m.monthNum, dueDay),
    }));
};

const shapeAudit = (audit: any, financialYearStart: number, year: number) => ({
  id: audit.id,
  auditId: audit.auditId,
  areaProcess: audit.areaProcess,
  auditName: audit.auditName,
  objectives: audit.objectives,
  scope: audit.scope,
  keyRisks: audit.keyRisks,
  lead: audit.lead,
  procedures: audit.procedures,
  startMonth: audit.startMonth,
  dueDay: audit.dueDay,
  createdAt: audit.createdAt,
  // Frequency always comes from the control, never stored on the audit.
  frequency: audit.control.frequency,
  control: {
    id: audit.control.id,
    controlId: audit.control.controlId,
    name: audit.control.name,
    description: audit.control.description,
    domain: audit.control.domain,
    frequency: audit.control.frequency,
    countryId: audit.control.countryId,
  },
  duePeriods: duePeriodsFor(
    audit.control.frequency,
    financialYearStart,
    audit.startMonth,
    audit.dueDay,
    year,
  ),
  periods: (audit.periods ?? []).map((p: any) => ({
    id: p.id,
    period: p.period,
    dueDate: p.dueDate,
    evidenceUrls: p.evidenceUrls,
    issues: (p.issues ?? []).map((i: any) => ({
      id: i.id,
      auditIssueId: i.auditIssueId,
      description: i.description,
      severity: i.severity,
      status: i.status,
      evidenceUrls: i.evidenceUrls,
      createdAt: i.createdAt,
      createdBy: i.createdBy,
    })),
  })),
});

const getFinancialYearStart = async (companyId: string) => {
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { financialYearStart: true },
  });
  return company?.financialYearStart ?? 1;
};

// Controls with at least one failing test, which don't already have an audit
// (one audit per control).
export const getFailedControls = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { country_id } = req.query as { country_id?: string };
    const countryWhere =
      country_id && country_id !== "all" ? { countryId: country_id } : {};

    const controls = await prisma.control.findMany({
      where: {
        companyId,
        ...countryWhere,
        status: "active",
        testResults: { some: { result: { in: FAILED_RESULTS as any } } },
        audits: { none: {} },
      },
      select: {
        id: true,
        controlId: true,
        name: true,
        description: true,
        domain: true,
        frequency: true,
        countryId: true,
        _count: {
          select: {
            testResults: { where: { result: { in: FAILED_RESULTS as any } } },
          },
        },
      },
      orderBy: [{ domain: "asc" }, { controlId: "asc" }],
    });

    res.status(200).json({
      data: controls.map((c: any) => ({
        id: c.id,
        controlId: c.controlId,
        name: c.name,
        description: c.description,
        domain: c.domain,
        frequency: c.frequency,
        countryId: c.countryId,
        failedTestCount: c._count.testResults,
      })),
      error: null,
    });
  } catch (error) {
    console.error("[getFailedControls] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const getAudit = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { country_id, year } = req.query as {
      country_id?: string;
      year?: string;
    };
    const countryWhere =
      country_id && country_id !== "all" ? { countryId: country_id } : {};

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const financialYearStart = await getFinancialYearStart(companyId);

    const audits = await prisma.audit.findMany({
      where: { companyId, ...countryWhere },
      include: {
        control: true,
        periods: {
          include: {
            issues: {
              include: {
                createdBy: { select: { id: true, fullName: true, email: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { period: "asc" },
        },
      },
      orderBy: { auditId: "asc" },
    });

    res.status(200).json({
      data: audits.map((a: any) =>
        shapeAudit(a, financialYearStart, currentYear),
      ),
      error: null,
    });
  } catch (error) {
    console.error("[getAudit] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const createAudit = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const {
      controlId,
      areaProcess,
      auditName,
      objectives,
      scope,
      keyRisks,
      lead,
      procedures,
      startMonth,
      dueDay,
    } = req.body ?? {};

    if (!controlId || typeof controlId !== "string") {
      res.status(400).json({ data: null, error: "controlId is required" });
      return;
    }
    if (!auditName || !String(auditName).trim()) {
      res.status(400).json({ data: null, error: "auditName is required" });
      return;
    }
    if (!startMonth || !PERIOD_RE.test(String(startMonth))) {
      res
        .status(400)
        .json({ data: null, error: "startMonth must be in YYYY-MM format" });
      return;
    }
    const day = Number(dueDay);
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      res
        .status(400)
        .json({ data: null, error: "dueDay must be a day between 1 and 31" });
      return;
    }

    const control = await prisma.control.findFirst({
      where: { id: controlId, companyId },
      include: {
        _count: {
          select: {
            testResults: { where: { result: { in: FAILED_RESULTS as any } } },
          },
        },
      },
    });

    if (!control) {
      res.status(404).json({ data: null, error: "Control not found" });
      return;
    }
    if (control._count.testResults === 0) {
      res.status(400).json({
        data: null,
        error: "Audits can only be raised against controls with failed tests",
      });
      return;
    }

    let created: any;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        created = await prisma.$transaction(async (tx: any) => {
          const auditId = await nextSequentialId(
            tx,
            "audit",
            "auditId",
            "AUD",
            companyId,
            attempt,
          );
          return tx.audit.create({
            data: {
              auditId,
              companyId,
              countryId: control.countryId,
              controlId: control.id,
              auditName: String(auditName).trim(),
              startMonth: String(startMonth),
              dueDay: day,
              createdById: userId,
              ...(areaProcess !== undefined && { areaProcess }),
              ...(objectives !== undefined && { objectives }),
              ...(scope !== undefined && { scope }),
              ...(keyRisks !== undefined && { keyRisks }),
              ...(lead !== undefined && { lead }),
              ...(procedures !== undefined && { procedures }),
            },
          });
        });
        break;
      } catch (err: any) {
        if (isIdClash(err, "controlId")) {
          res.status(409).json({
            data: null,
            error: "This control already has an audit",
          });
          return;
        }
        if (isIdClash(err, "auditId") && attempt < 4) continue;
        throw err;
      }
    }

    await logAudit({
      companyId,
      userId,
      action: "created",
      entityType: "audit",
      entityId: created.id,
      detail: `Created audit ${created.auditId} for control ${control.controlId}`,
    });

    const financialYearStart = await getFinancialYearStart(companyId);
    const full = await prisma.audit.findUnique({
      where: { id: created.id },
      include: { control: true, periods: { include: { issues: true } } },
    });

    res.status(201).json({
      data: shapeAudit(full, financialYearStart, new Date().getFullYear()),
      error: null,
    });
  } catch (error) {
    console.error("[createAudit] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const updateAudit = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const { id } = req.params as { id: string };
    const {
      areaProcess,
      auditName,
      objectives,
      scope,
      keyRisks,
      lead,
      procedures,
      startMonth,
      dueDay,
    } = req.body ?? {};

    const existing = await prisma.audit.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      res.status(404).json({ data: null, error: "Audit not found" });
      return;
    }

    if (auditName !== undefined && !String(auditName).trim()) {
      res.status(400).json({ data: null, error: "auditName cannot be empty" });
      return;
    }
    if (startMonth !== undefined && !PERIOD_RE.test(String(startMonth))) {
      res
        .status(400)
        .json({ data: null, error: "startMonth must be in YYYY-MM format" });
      return;
    }
    if (dueDay !== undefined) {
      const day = Number(dueDay);
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        res
          .status(400)
          .json({ data: null, error: "dueDay must be a day between 1 and 31" });
        return;
      }
    }

    await prisma.audit.update({
      where: { id },
      data: {
        ...(auditName !== undefined && { auditName: String(auditName).trim() }),
        ...(areaProcess !== undefined && { areaProcess }),
        ...(objectives !== undefined && { objectives }),
        ...(scope !== undefined && { scope }),
        ...(keyRisks !== undefined && { keyRisks }),
        ...(lead !== undefined && { lead }),
        ...(procedures !== undefined && { procedures }),
        ...(startMonth !== undefined && { startMonth: String(startMonth) }),
        ...(dueDay !== undefined && { dueDay: Number(dueDay) }),
      },
    });

    await logAudit({
      companyId,
      userId,
      action: "updated",
      entityType: "audit",
      entityId: id,
      detail: `Updated audit ${existing.auditId}`,
    });

    const financialYearStart = await getFinancialYearStart(companyId);
    const full = await prisma.audit.findUnique({
      where: { id },
      include: {
        control: true,
        periods: {
          include: {
            issues: {
              include: {
                createdBy: { select: { id: true, fullName: true, email: true } },
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      data: shapeAudit(full, financialYearStart, new Date().getFullYear()),
      error: null,
    });
  } catch (error) {
    console.error("[updateAudit] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const deleteAudit = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const { id } = req.params as { id: string };

    const existing = await prisma.audit.findFirst({ where: { id, companyId } });
    if (!existing) {
      res.status(404).json({ data: null, error: "Audit not found" });
      return;
    }

    // Dependants first — no cascade is configured on these relations.
    await prisma.$transaction(async (tx: any) => {
      const periods = await tx.auditPeriod.findMany({
        where: { auditId: id },
        select: { id: true },
      });
      const periodIds = periods.map((p: any) => p.id);
      if (periodIds.length > 0) {
        await tx.auditIssue.deleteMany({
          where: { auditPeriodId: { in: periodIds } },
        });
      }
      await tx.auditPeriod.deleteMany({ where: { auditId: id } });
      await tx.audit.delete({ where: { id } });
    });

    await logAudit({
      companyId,
      userId,
      action: "deleted",
      entityType: "audit",
      entityId: id,
      detail: `Deleted audit ${existing.auditId}`,
    });

    res.status(200).json({ data: { id }, error: null });
  } catch (error) {
    console.error("[deleteAudit] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

// Periods are created lazily: a row only exists once someone actually attaches
// evidence or raises an issue for that period.
const ensurePeriod = async (tx: any, audit: any, period: string) => {
  const existing = await tx.auditPeriod.findUnique({
    where: { auditId_period: { auditId: audit.id, period } },
  });
  if (existing) return existing;

  const [yearStr, monthStr] = period.split("-");
  const dueDate = dueDateFor(
    parseInt(yearStr as string, 10),
    parseInt(monthStr as string, 10),
    audit.dueDay,
  );

  return tx.auditPeriod.create({
    data: {
      auditId: audit.id,
      companyId: audit.companyId,
      period,
      dueDate,
    },
  });
};

const loadAuditForPeriod = async (
  res: Response,
  companyId: string,
  id: string,
  period: string,
) => {
  if (!PERIOD_RE.test(period)) {
    res
      .status(400)
      .json({ data: null, error: "period must be in YYYY-MM format" });
    return null;
  }

  const audit = await prisma.audit.findFirst({
    where: { id, companyId },
    include: { control: true },
  });
  if (!audit) {
    res.status(404).json({ data: null, error: "Audit not found" });
    return null;
  }

  const financialYearStart = await getFinancialYearStart(companyId);
  const monthNum = parseInt(period.split("-")[1] as string, 10);

  // Guard against work being filed against a month the audit never falls due in.
  const dueThisMonth = isOneOff(audit.control.frequency)
    ? period === audit.startMonth
    : isControlDueInMonth(
        audit.control.frequency,
        monthNum,
        financialYearStart,
      ) && period >= audit.startMonth;

  if (!dueThisMonth) {
    res.status(400).json({
      data: null,
      error: "This audit is not due in that period",
    });
    return null;
  }

  return { audit, financialYearStart };
};

export const addPeriodEvidence = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const { id, period } = req.params as { id: string; period: string };
    const { evidenceUrls } = req.body ?? {};

    if (!Array.isArray(evidenceUrls) || evidenceUrls.length === 0) {
      res
        .status(400)
        .json({ data: null, error: "evidenceUrls must be a non-empty array" });
      return;
    }

    const loaded = await loadAuditForPeriod(res, companyId, id, period);
    if (!loaded) return;

    const updated = await prisma.$transaction(async (tx: any) => {
      const row = await ensurePeriod(tx, loaded.audit, period);
      return tx.auditPeriod.update({
        where: { id: row.id },
        data: { evidenceUrls: { push: evidenceUrls.map(String) } },
      });
    });

    await logAudit({
      companyId,
      userId,
      action: "evidence_added",
      entityType: "audit",
      entityId: id,
      detail: `Added ${evidenceUrls.length} evidence file(s) to ${loaded.audit.auditId} for ${period}`,
    });

    res.status(201).json({ data: updated, error: null });
  } catch (error) {
    console.error("[addPeriodEvidence] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const createAuditIssue = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const { id, period } = req.params as { id: string; period: string };
    const { description, severity, evidenceUrls } = req.body ?? {};

    if (!description || !String(description).trim()) {
      res.status(400).json({ data: null, error: "description is required" });
      return;
    }
    if (severity && !["low", "medium", "high"].includes(String(severity))) {
      res
        .status(400)
        .json({ data: null, error: "severity must be low, medium or high" });
      return;
    }

    const loaded = await loadAuditForPeriod(res, companyId, id, period);
    if (!loaded) return;

    let created: any;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        created = await prisma.$transaction(async (tx: any) => {
          const row = await ensurePeriod(tx, loaded.audit, period);
          const auditIssueId = await nextSequentialId(
            tx,
            "auditIssue",
            "auditIssueId",
            "AI",
            companyId,
            attempt,
          );
          return tx.auditIssue.create({
            data: {
              auditIssueId,
              companyId,
              auditPeriodId: row.id,
              description: String(description).trim(),
              severity: (severity ?? "medium") as any,
              createdById: userId,
              ...(Array.isArray(evidenceUrls) && {
                evidenceUrls: evidenceUrls.map(String),
              }),
            },
            include: {
              createdBy: { select: { id: true, fullName: true, email: true } },
            },
          });
        });
        break;
      } catch (err: any) {
        if (isIdClash(err, "auditIssueId") && attempt < 4) continue;
        throw err;
      }
    }

    await logAudit({
      companyId,
      userId,
      action: "created",
      entityType: "audit_issue",
      entityId: created.id,
      detail: `Raised audit issue ${created.auditIssueId} on ${loaded.audit.auditId} for ${period}`,
    });

    res.status(201).json({ data: created, error: null });
  } catch (error) {
    console.error("[createAuditIssue] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const updateAuditIssue = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const { issueId } = req.params as { issueId: string };
    const { description, severity, status, evidenceUrls } = req.body ?? {};

    const existing = await prisma.auditIssue.findFirst({
      where: { id: issueId, companyId },
    });
    if (!existing) {
      res.status(404).json({ data: null, error: "Audit issue not found" });
      return;
    }

    if (description !== undefined && !String(description).trim()) {
      res.status(400).json({ data: null, error: "description cannot be empty" });
      return;
    }
    if (
      severity !== undefined &&
      !["low", "medium", "high"].includes(String(severity))
    ) {
      res
        .status(400)
        .json({ data: null, error: "severity must be low, medium or high" });
      return;
    }
    if (
      status !== undefined &&
      !["open", "in_progress", "closed"].includes(String(status))
    ) {
      res.status(400).json({
        data: null,
        error: "status must be open, in_progress or closed",
      });
      return;
    }

    const updated = await prisma.auditIssue.update({
      where: { id: issueId },
      data: {
        ...(description !== undefined && {
          description: String(description).trim(),
        }),
        ...(severity !== undefined && { severity: severity as any }),
        ...(status !== undefined && { status: status as any }),
        ...(Array.isArray(evidenceUrls) && {
          evidenceUrls: evidenceUrls.map(String),
        }),
      },
      include: {
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    await logAudit({
      companyId,
      userId,
      action: "updated",
      entityType: "audit_issue",
      entityId: issueId,
      detail: `Updated audit issue ${existing.auditIssueId}`,
    });

    res.status(200).json({ data: updated, error: null });
  } catch (error) {
    console.error("[updateAuditIssue] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const deleteAuditIssue = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const { issueId } = req.params as { issueId: string };

    const existing = await prisma.auditIssue.findFirst({
      where: { id: issueId, companyId },
    });
    if (!existing) {
      res.status(404).json({ data: null, error: "Audit issue not found" });
      return;
    }

    await prisma.auditIssue.delete({ where: { id: issueId } });

    await logAudit({
      companyId,
      userId,
      action: "deleted",
      entityType: "audit_issue",
      entityId: issueId,
      detail: `Deleted audit issue ${existing.auditIssueId}`,
    });

    res.status(200).json({ data: { id: issueId }, error: null });
  } catch (error) {
    console.error("[deleteAuditIssue] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
