import { Response } from "express";
import { Request } from "express";
import { prisma } from "../../config/prisma";
import { logAudit } from "../../utils/auditLog";
import { sendEmail } from "../../utils/email";
import { createDocumentRequest } from "../../utils/documentRequest";
import {
  MONTH_NAMES,
  isControlDueInMonth,
  buildFinancialYearMonths,
  dueDateFor,
} from "../../utils/schedule";

// Any control can be audited. Failed-test counts are still surfaced so the
// person picking a control can see which ones already have findings.
const FAILED_RESULTS = ["fail"] as const;

// Audits are carried out by testers (and admins). A control owner is a
// respondent: they only ever see audits addressed to them.
const isResponder = (role: string) => role === "control_owner";

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
  recipient: audit.recipient ?? null,
  requests: (audit.requests ?? []).map((r: any) => ({
    id: r.id,
    requestId: r.requestId,
    subject: r.subject,
    message: r.message,
    period: r.period,
    dueDate: r.dueDate,
    status: r.status,
    createdAt: r.createdAt,
    recipient: r.recipient ?? null,
  })),
  comments: (audit.comments ?? []).map((c: any) => ({
    id: c.id,
    message: c.message,
    period: c.period,
    isRequest: c.isRequest,
    evidenceUrls: c.evidenceUrls,
    createdAt: c.createdAt,
    author: c.author,
  })),
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

// Anyone in the company can be picked as the recipient of an audit request.
export const getRecipients = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const members = await prisma.userCompany.findMany({
      where: { companyId },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    res.status(200).json({
      data: members
        .map((m: any) => ({
          id: m.user.id,
          fullName: m.user.fullName,
          email: m.user.email,
          role: m.role,
        }))
        .sort((a: any, b: any) =>
          (a.fullName ?? a.email).localeCompare(b.fullName ?? b.email),
        ),
      error: null,
    });
  } catch (error) {
    console.error("[getRecipients] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

// Every active control can be audited; only ones that don't already have an
// audit are offered, because a control carries at most one audit.
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
    const userId = req.user!.userId;
    const role = req.user!.role;
    const { country_id, year } = req.query as {
      country_id?: string;
      year?: string;
    };
    const countryWhere =
      country_id && country_id !== "all" ? { countryId: country_id } : {};

    const currentYear = year ? parseInt(year) : new Date().getFullYear();
    const financialYearStart = await getFinancialYearStart(companyId);

    // Responders see only what was addressed to them, never other audits.
    const recipientWhere = isResponder(role) ? { recipientId: userId } : {};

    const audits = await prisma.audit.findMany({
      where: { companyId, ...countryWhere, ...recipientWhere },
      include: {
        control: true,
        recipient: { select: { id: true, fullName: true, email: true } },
        requests: {
          include: {
            recipient: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
        comments: {
          include: {
            author: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
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
      recipientId,
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
    });

    if (!control) {
      res.status(404).json({ data: null, error: "Control not found" });
      return;
    }

    // The recipient may be any user in the company.
    if (recipientId) {
      const recipient = await prisma.userCompany.findFirst({
        where: { userId: String(recipientId), companyId },
      });
      if (!recipient) {
        res
          .status(400)
          .json({ data: null, error: "Recipient is not a member of this company" });
        return;
      }
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
              ...(recipientId ? { recipientId: String(recipientId) } : {}),
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
      include: {
        control: true,
        recipient: { select: { id: true, fullName: true, email: true } },
        comments: true,
        periods: { include: { issues: true } },
      },
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
      recipientId,
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
        ...(recipientId !== undefined && {
          recipientId: recipientId ? String(recipientId) : null,
        }),
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
        recipient: { select: { id: true, fullName: true, email: true } },
        comments: {
          include: {
            author: { select: { id: true, fullName: true, email: true } },
          },
          orderBy: { createdAt: "asc" },
        },
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
      await tx.documentRequest.updateMany({
        where: { auditId: id },
        data: { auditId: null },
      });
      await tx.auditComment.deleteMany({ where: { auditId: id } });
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
  actor?: { userId: string; role: string },
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

  // A responder may only act on audits addressed to them.
  if (actor && isResponder(actor.role) && audit.recipientId !== actor.userId) {
    res.status(403).json({ data: null, error: "Access denied" });
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

    const loaded = await loadAuditForPeriod(res, companyId, id, period, {
      userId,
      role: req.user!.role,
    });
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

// Post a comment on an audit. Flagging it as a request is the ONLY thing that
// emails the recipient — creating an audit on its own never notifies anyone.
export const createAuditComment = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const { id } = req.params as { id: string };
    const { message, period, isRequest, evidenceUrls, dueDate } =
      req.body ?? {};

    if (!message || !String(message).trim()) {
      res.status(400).json({ data: null, error: "message is required" });
      return;
    }
    if (period !== undefined && period !== null && !PERIOD_RE.test(String(period))) {
      res
        .status(400)
        .json({ data: null, error: "period must be in YYYY-MM format" });
      return;
    }

    const audit = await prisma.audit.findFirst({
      where: { id, companyId },
      include: {
        control: true,
        recipient: { select: { id: true, fullName: true, email: true } },
      },
    });
    if (!audit) {
      res.status(404).json({ data: null, error: "Audit not found" });
      return;
    }
    if (isResponder(role) && audit.recipientId !== userId) {
      res.status(403).json({ data: null, error: "Access denied" });
      return;
    }

    // A request raised on an audit is a real request: it belongs in the
    // Requests tab, carries a needed-by date and is chased by the same
    // reminder job. Plain comments stay as audit conversation.
    if (isRequest) {
      if (!audit.recipientId) {
        res.status(400).json({
          data: null,
          error: "Set a recipient on this audit before sending a request",
        });
        return;
      }

      const { request, emailSent, emailError } = await createDocumentRequest({
        companyId,
        countryId: audit.countryId,
        controlId: audit.controlId,
        requesterId: userId,
        recipientId: audit.recipientId,
        period: String(period ?? audit.startMonth),
        subject: `${audit.auditId} — ${audit.auditName}`,
        message: String(message).trim(),
        dueDate: dueDate ?? null,
        auditId: audit.id,
      });

      await logAudit({
        companyId,
        userId,
        action: "request_sent",
        entityType: "request",
        entityId: request.id,
        detail: `Request ${request.requestId} raised on ${audit.auditId}`,
      });

      res.status(201).json({
        data: { ...request, isRequest: true, emailSent, emailError },
        error: null,
      });
      return;
    }

    const comment = await prisma.auditComment.create({
      data: {
        auditId: id,
        companyId,
        authorId: userId,
        message: String(message).trim(),
        isRequest: Boolean(isRequest),
        ...(period ? { period: String(period) } : {}),
        ...(Array.isArray(evidenceUrls) && {
          evidenceUrls: evidenceUrls.map(String),
        }),
      },
      include: {
        author: { select: { id: true, fullName: true, email: true } },
      },
    });

    // Notify the recipient only when this was explicitly sent as a request.
    let emailSent = false;
    let emailError: string | null = null;
    if (comment.isRequest && audit.recipient?.email) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { name: true },
      });
      const appUrl = process.env.FRONTEND_URL ?? "";
      try {
        await sendEmail({
          to: audit.recipient.email,
          subject: `Action required: ${audit.auditId} — ${audit.auditName}`,
          html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You have a new audit request</h2>
          <p><strong>${comment.author.fullName ?? comment.author.email}</strong> has requested information for an audit on
          <strong>${company?.name ?? "your organisation"}</strong>'s GRC Control Tool.</p>
          <table style="border-collapse: collapse; margin: 16px 0; font-size: 14px;">
            <tr><td style="padding: 4px 12px 4px 0; color: #555;">Audit</td><td><strong>${audit.auditId} — ${audit.auditName}</strong></td></tr>
            <tr><td style="padding: 4px 12px 4px 0; color: #555;">Control</td><td>${audit.control.controlId} — ${audit.control.name}</td></tr>
            ${comment.period ? `<tr><td style="padding: 4px 12px 4px 0; color: #555;">Period</td><td>${comment.period}</td></tr>` : ""}
          </table>
          <p style="background: #f6f6f6; border-left: 3px solid #2563eb; padding: 12px; white-space: pre-wrap;">${comment.message}</p>
          <p>Log in to the GRC Control Tool to respond and upload the requested documents.</p>
          <a href="${appUrl}/audit" style="
            display: inline-block;
            padding: 12px 24px;
            background-color: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin-top: 16px;
          ">Open Audit</a>
        </div>`,
        });
        emailSent = true;
      } catch (err) {
        // The comment is already saved — never lose it because mail failed.
        emailError = err instanceof Error ? err.message : "Email failed";
      }
    }

    await logAudit({
      companyId,
      userId,
      action: comment.isRequest ? "request_sent" : "commented",
      entityType: "audit",
      entityId: id,
      detail: comment.isRequest
        ? `Request sent on ${audit.auditId} to ${audit.recipient?.email ?? "no recipient"}`
        : `Comment added on ${audit.auditId}`,
    });

    res.status(201).json({
      data: { ...comment, emailSent, emailError },
      error: null,
    });
  } catch (error) {
    console.error("[createAuditComment] error:", error);
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
