import { Response } from "express";
import { Request } from "express";
import { prisma } from "../../config/prisma";
import { logAudit } from "../../utils/auditLog";

const VALID_DOMAINS = [
  "Fixed Asset",
  "HR",
  "Revenue",
  "Governance & Compliance",
  "Inventory",
  "IT",
  "Accounting & Reporting",
  "Taxation",
  "Treasury",
  "Sustainability",
  "Expenditure",
  "Operations",
];

// Natural sort so control IDs order like 1.1, 1.2, 1.10 (not 1.1, 1.10, 1.2)
const naturalControlIdCompare = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });

export const getControls = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;

    const controls = await prisma.control.findMany({
      where: { companyId },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        tester: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: { controlId: "asc" },
    });

    // Natural sort (1.1, 1.2, ... 1.10) since DB string sort is lexicographic
    controls.sort((a, b) => naturalControlIdCompare(a.controlId, b.controlId));

    res.status(200).json({ data: controls, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const createControl = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const {
      controlId,
      name,
      domain,
      risk,
      frequency,
      description,
      ownerId,
      testerId,
      nature,
      type,
      testDueDay,
      testDueDate,
      countryId,
      status,
    } = req.body;

    if (
      !controlId ||
      !name ||
      !domain ||
      !risk ||
      !frequency ||
      !nature ||
      !type ||
      !countryId
    ) {
      res.status(400).json({ data: null, error: "All fields are required" });
      return;
    }

    if (!VALID_DOMAINS.includes(domain)) {
      res.status(400).json({
        data: null,
        error: `Invalid domain. Must be one of: ${VALID_DOMAINS.join(", ")}`,
      });
      return;
    }

    const existing = await prisma.control.findUnique({
      where: {
        companyId_controlId_countryId: { companyId, controlId, countryId },
      },
    });

    if (existing) {
      res.status(409).json({ data: null, error: "Control ID already exists" });
      return;
    }

    // If countryId is "all", create the control for every country in the company
    if (countryId === "all") {
      const allCountries = await prisma.country.findMany({
        where: { companyId },
        select: { id: true },
      });

      if (allCountries.length === 0) {
        res
          .status(400)
          .json({ data: null, error: "No countries found for this company" });
        return;
      }

      const created = await Promise.all(
        allCountries.map((country: { id: string }, index: number) =>
          prisma.control.create({
            data: {
              companyId,
              countryId: country.id,
              // Append country index to keep controlId unique per country
              controlId: index === 0 ? controlId : `${controlId}-${index + 1}`,
              description,
              name,
              domain,
              risk,
              frequency: frequency as any,
              nature: nature as any,
              type: type as any,
              // Keep the day-of-month in sync with the calendar date (used by
              // overdue calculations); fall back to the legacy day or 15.
              testDueDay: testDueDate
                ? new Date(testDueDate).getUTCDate()
                : (testDueDay ?? 15),
              testDueDate: testDueDate ? new Date(testDueDate) : null,
              ownerId: ownerId || null,
              testerId: testerId || null,
              status: (status as any) || "active",
            },
          }),
        ),
      );

      await logAudit({
        companyId,
        userId: req.user!.userId,
        action: "Control created",
        entityType: "control",
        entityId: created[0]!.id,
        detail: `${controlId} — ${name} (all countries)`,
      });

      res.status(201).json({ data: created, error: null });
      return;
    }

    // Single country
    const control = await prisma.control.create({
      data: {
        companyId,
        countryId,
        controlId,
        description,
        name,
        domain,
        risk,
        frequency: frequency as any,
        nature: nature as any,
        type: type as any,
        // Keep the day-of-month in sync with the calendar date (used by
        // overdue calculations); fall back to the legacy day or 15.
        testDueDay: testDueDate
          ? new Date(testDueDate).getUTCDate()
          : (testDueDay ?? 15),
        testDueDate: testDueDate ? new Date(testDueDate) : null,
        ownerId: ownerId || null,
        testerId: testerId || null,
        status: (status as any) || "active",
      },
    });

    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Control created",
      entityType: "control",
      entityId: control.id,
      detail: `${control.controlId} — ${control.name}`,
    });

    res.status(201).json({ data: control, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const updateControl = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };
    const {
      controlId,
      name,
      domain,
      risk,
      frequency,
      description,
      ownerId,
      testerId,
      nature,
      type,
      testDueDay,
      testDueDate,
      countryId,
      status,
    } = req.body as {
      controlId?: string;
      name?: string;
      domain?: string;
      risk?: string;
      frequency?: string;
      description?: string;
      ownerId?: string;
      testerId?: string;
      nature?: string;
      type?: string;
      testDueDay?: number;
      testDueDate?: string | null;
      countryId?: string;
      status?: string;
    };

    if (domain !== undefined && !VALID_DOMAINS.includes(domain)) {
      res.status(400).json({
        data: null,
        error: `Invalid domain. Must be one of: ${VALID_DOMAINS.join(", ")}`,
      });
      return;
    }

    // Normalize + validate the Control ID when it's being changed.
    const normalizedControlId =
      controlId !== undefined ? controlId.trim() : undefined;
    if (normalizedControlId !== undefined && normalizedControlId === "") {
      res
        .status(400)
        .json({ data: null, error: "Control ID cannot be empty" });
      return;
    }

    const existing = await prisma.control.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      res.status(404).json({ data: null, error: "Control not found" });
      return;
    }

    // If the controlId (or country) changes, enforce the per-entity uniqueness
    if (
      (normalizedControlId !== undefined &&
        normalizedControlId !== existing.controlId) ||
      (countryId !== undefined && countryId !== existing.countryId)
    ) {
      const effControlId = normalizedControlId ?? existing.controlId;
      const effCountryId = countryId ?? existing.countryId;
      const clash = await prisma.control.findFirst({
        where: {
          companyId,
          controlId: effControlId,
          countryId: effCountryId,
          NOT: { id },
        },
      });
      if (clash) {
        res.status(409).json({
          data: null,
          error: "A control with that ID already exists for this entity",
        });
        return;
      }
    }

    const control = await prisma.control.update({
      where: { id },
      data: {
        ...(normalizedControlId !== undefined && {
          controlId: normalizedControlId,
        }),
        ...(name !== undefined && { name }),
        ...(domain !== undefined && { domain }),
        ...(risk !== undefined && { risk }),
        ...(description != undefined && { description }),
        ...(frequency !== undefined && { frequency: frequency as any }),
        ...(nature !== undefined && { nature: nature as any }),
        ...(type !== undefined && { type: type as any }),
        ...(testDueDate !== undefined && {
          testDueDate: testDueDate ? new Date(testDueDate) : null,
        }),
        // When a calendar date is set it drives the day-of-month too; otherwise
        // honour an explicit testDueDay (legacy/API callers).
        ...(testDueDate
          ? { testDueDay: new Date(testDueDate).getUTCDate() }
          : testDueDay !== undefined
            ? { testDueDay }
            : {}),
        ...(countryId !== undefined && { countryId }),
        ...(status !== undefined && { status: status as any }),
        ...(ownerId !== undefined && { ownerId: ownerId || null }),
        ...(testerId !== undefined && { testerId: testerId || null }),
      },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        tester: { select: { id: true, fullName: true, email: true } },
      },
    });

    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Control updated",
      entityType: "control",
      entityId: id,
      detail: `${existing.controlId} — ${existing.name}`,
    });

    res.status(200).json({ data: control, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const deleteControl = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };

    const existing = await prisma.control.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      res.status(404).json({ data: null, error: "Control not found" });
      return;
    }

    // A control may have dependent rows: test results, issues with their
    // actions, test-plan overrides, audits (with their periods, findings and
    // conversation) and document requests (with their messages). Every one of
    // these has a foreign key to the control, so they must go first or the
    // delete fails with a constraint error.
    const [issues, audits] = await Promise.all([
      prisma.issue.findMany({
        where: { controlId: id, companyId },
        select: { id: true },
      }),
      prisma.audit.findMany({
        where: { controlId: id, companyId },
        select: { id: true },
      }),
    ]);
    const issueIds = issues.map((i) => i.id);
    const auditIds = audits.map((a) => a.id);

    const auditPeriods = auditIds.length
      ? await prisma.auditPeriod.findMany({
          where: { auditId: { in: auditIds } },
          select: { id: true },
        })
      : [];
    const auditPeriodIds = auditPeriods.map((p) => p.id);

    await prisma.$transaction([
      ...(issueIds.length
        ? [prisma.action.deleteMany({ where: { issueId: { in: issueIds } } })]
        : []),
      prisma.issue.deleteMany({ where: { controlId: id, companyId } }),
      prisma.testResult.deleteMany({ where: { controlId: id, companyId } }),
      prisma.testPlanOverride.deleteMany({
        where: { controlId: id, companyId },
      }),
      ...(auditPeriodIds.length
        ? [
            prisma.auditIssue.deleteMany({
              where: { auditPeriodId: { in: auditPeriodIds } },
            }),
          ]
        : []),
      ...(auditIds.length
        ? [
            prisma.auditComment.deleteMany({
              where: { auditId: { in: auditIds } },
            }),
            prisma.auditPeriod.deleteMany({
              where: { auditId: { in: auditIds } },
            }),
          ]
        : []),
      prisma.audit.deleteMany({ where: { controlId: id, companyId } }),
      prisma.documentRequestMessage.deleteMany({
        where: { request: { controlId: id, companyId } },
      }),
      prisma.documentRequest.deleteMany({ where: { controlId: id, companyId } }),
      prisma.control.delete({ where: { id } }),
    ]);

    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Control deleted",
      entityType: "control",
      entityId: id,
      detail: `${existing.controlId} — ${existing.name}`,
    });

    res.status(200).json({ data: { message: "Control deleted" }, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const getDomains = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  res.status(200).json({ data: VALID_DOMAINS, error: null });
};

// ─── Countries ───────────────────────────────────────────

export const getCountries = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const countries = await prisma.country.findMany({
      where: { companyId },
      orderBy: { name: "asc" },
    });
    res.status(200).json({ data: countries, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const createCountry = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { name, code } = req.body;

    if (!name || !code) {
      res.status(400).json({ data: null, error: "Name and code are required" });
      return;
    }

    const existing = await prisma.country.findUnique({
      where: { companyId_code: { companyId, code } },
    });

    if (existing) {
      res
        .status(409)
        .json({ data: null, error: "Country code already exists" });
      return;
    }

    const country = await prisma.country.create({
      data: { companyId, name, code },
    });

    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Country added",
      entityType: "country",
      entityId: country.id,
      detail: `${country.name} — ${country.code}`,
    });

    res.status(201).json({ data: country, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const deleteCountry = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };

    const existing = await prisma.country.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      res.status(404).json({ data: null, error: "Country not found" });
      return;
    }

    // Deleting a country that still holds controls would take every test
    // result, issue and audit under it with it. Refuse with a clear message
    // instead of failing on a foreign key and surfacing a 500.
    const controlCount = await prisma.control.count({
      where: { countryId: id, companyId },
    });
    if (controlCount > 0) {
      res.status(400).json({
        data: null,
        error: `This country still has ${controlCount} control${
          controlCount > 1 ? "s" : ""
        }. Delete or move them before removing the country.`,
      });
      return;
    }

    await prisma.country.delete({ where: { id } });

    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Country deleted",
      entityType: "country",
      entityId: id,
      detail: `${existing.name} — ${existing.code}`,
    });

    res.status(200).json({ data: { message: "Country deleted" }, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

// ─── Company ───────────────────────────────────────────

export const getCompany = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, financialYearStart: true },
    });
    res.status(200).json({ data: company, error: null });
  } catch {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const updateCompany = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { name, financialYearStart } = req.body;

    if (
      financialYearStart &&
      (financialYearStart < 1 || financialYearStart > 12)
    ) {
      res.status(400).json({
        data: null,
        error: "Financial year start must be between 1 and 12",
      });
      return;
    }

    const company = await prisma.company.update({
      where: { id: companyId },
      data: { name, financialYearStart },
    });

    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Company updated",
      entityType: "company",
      entityId: companyId,
      detail: `Financial year start: ${financialYearStart}`,
    });

    res.status(200).json({ data: company, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const getMembers = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;

    const members = await prisma.userCompany.findMany({
      where: { companyId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            avatarUrl: true,
            createdAt: true,
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    const data = members.map((m: any) => ({
      id: m.user.id,
      fullName: m.user.fullName,
      email: m.user.email,
      avatarUrl: m.user.avatarUrl,
      role: m.role,
      joinedAt: m.joinedAt,
    }));

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const updateMemberRole = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };
    const { role } = req.body as { role: string };

    if (!role) {
      res.status(400).json({ data: null, error: "Role is required" });
      return;
    }

    const validRoles = ["admin", "control_owner", "tester", "viewer"];
    if (!validRoles.includes(role)) {
      res.status(400).json({ data: null, error: "Invalid role" });
      return;
    }

    if (id === req.user!.userId) {
      res
        .status(400)
        .json({ data: null, error: "You cannot change your own role" });
      return;
    }

    const existing = await prisma.userCompany.findFirst({
      where: { userId: id, companyId },
    });

    if (!existing) {
      res.status(404).json({ data: null, error: "Member not found" });
      return;
    }

    const updated = await prisma.userCompany.update({
      where: { id: existing.id },
      data: { role: role as any },
    });

    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Member role updated",
      entityType: "user",
      entityId: id,
      detail: `New role: ${role}`,
    });

    res.status(200).json({ data: updated, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const removeMember = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };

    if (id === req.user!.userId) {
      res.status(400).json({ data: null, error: "You cannot remove yourself" });
      return;
    }

    const existing = await prisma.userCompany.findFirst({
      where: { userId: id, companyId },
    });

    if (!existing) {
      res.status(404).json({ data: null, error: "Member not found" });
      return;
    }

    await prisma.userCompany.delete({ where: { id: existing.id } });

    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Member removed",
      entityType: "user",
      entityId: id,
      detail: `User ${id} removed from company`,
    });

    res.status(200).json({ data: { message: "Member removed" }, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

// ─── Process Owners ───────────────────────────────────────────

export const getProcessOwners = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;

    const controls = await prisma.control.findMany({
      where: { companyId },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        country: { select: { id: true, name: true, code: true } },
      },
      orderBy: { controlId: "asc" },
    });

    const data = controls.map((c: any) => ({
      id: c.id,
      controlId: c.controlId,
      name: c.name,
      domain: c.domain,
      country: c.country,
      owner: c.owner,
      status: c.status,
    }));

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const reassignOwner = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };
    const { ownerId } = req.body as { ownerId: string };

    if (!ownerId) {
      res.status(400).json({ data: null, error: "ownerId is required" });
      return;
    }

    const control = await prisma.control.findFirst({
      where: { id, companyId },
    });

    if (!control) {
      res.status(404).json({ data: null, error: "Control not found" });
      return;
    }

    const member = await prisma.userCompany.findFirst({
      where: { userId: ownerId, companyId },
    });

    if (!member) {
      res.status(404).json({ data: null, error: "User not found in company" });
      return;
    }

    const updated = await prisma.control.update({
      where: { id },
      data: { ownerId },
      include: { owner: { select: { id: true, fullName: true, email: true } } },
    });

    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Control owner reassigned",
      entityType: "control",
      entityId: id,
      detail: `${control.controlId} — new owner: ${ownerId}`,
    });

    res.status(200).json({ data: updated, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
