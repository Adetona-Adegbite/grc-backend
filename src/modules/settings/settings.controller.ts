import { Response } from "express";
import { AuthRequest } from "../../middleware/authenticate";
import { prisma } from "../../config/prisma";
import { logAudit } from "../../utils/auditLog";

// ─── Controls ───────────────────────────────────────────

export const getControls = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;

    const controls = await prisma.control.findMany({
      where: { companyId },
      include: { owner: { select: { id: true, fullName: true, email: true } } },
      orderBy: { controlId: "asc" },
    });

    res.status(200).json({ data: controls, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const createControl = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const {
      controlId,
      name,
      domain,
      risk,
      frequency,
      ownerId,
      testerId,
      nature,
      type,
      testDueDay,
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

    const existing = await prisma.control.findUnique({
      where: { companyId_controlId: { companyId, controlId } },
    });

    if (existing) {
      res.status(409).json({ data: null, error: "Control ID already exists" });
      return;
    }

    const control = await prisma.control.create({
      data: {
        companyId,
        countryId,
        controlId,
        name,
        domain,
        risk,
        frequency: frequency as any,
        nature: nature as any,
        type: type as any,
        testDueDay: testDueDay || 15,
        ownerId: ownerId || null,
        testerId: testerId || null,
        status: (status as any) || "active",
      },
    });

    res.status(201).json({ data: control, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const updateControl = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };
    const {
      name,
      domain,
      risk,
      frequency,
      ownerId,
      testerId,
      nature,
      type,
      testDueDay,
      countryId,
      status,
    } = req.body as {
      name?: string;
      domain?: string;
      risk?: string;
      frequency?: string;
      ownerId?: string;
      testerId?: string;
      nature?: string;
      type?: string;
      testDueDay?: number;
      countryId?: string;
      status?: string;
    };

    const existing = await prisma.control.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      res.status(404).json({ data: null, error: "Control not found" });
      return;
    }

    const control = await prisma.control.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(domain !== undefined && { domain }),
        ...(risk !== undefined && { risk }),
        ...(frequency !== undefined && { frequency: frequency as any }),
        ...(nature !== undefined && { nature: nature as any }),
        ...(type !== undefined && { type: type as any }),
        ...(testDueDay !== undefined && { testDueDay }),
        ...(countryId !== undefined && { countryId }),
        ...(status !== undefined && { status: status as any }),
        ...(ownerId !== undefined && { ownerId: ownerId || null }),
        ...(testerId !== undefined && { testerId: testerId || null }),
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
  req: AuthRequest,
  res: Response
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

    await prisma.control.delete({ where: { id } });

    res.status(200).json({ data: { message: "Control deleted" }, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

// ─── Countries ───────────────────────────────────────────

export const getCountries = async (
  req: AuthRequest,
  res: Response
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
  req: AuthRequest,
  res: Response
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

    res.status(201).json({ data: country, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const deleteCountry = async (
  req: AuthRequest,
  res: Response
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

    await prisma.country.delete({ where: { id } });

    res.status(200).json({ data: { message: "Country deleted" }, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

// ─── Company ───────────────────────────────────────────

export const updateCompany = async (
  req: AuthRequest,
  res: Response
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

    res.status(200).json({ data: company, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const getMembers = async (
  req: AuthRequest,
  res: Response
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

    const data = members.map((m) => ({
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
  req: AuthRequest,
  res: Response
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

    // Prevent admin from changing their own role
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

    res.status(200).json({ data: updated, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const removeMember = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };

    // Prevent admin from removing themselves
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

    res.status(200).json({ data: { message: "Member removed" }, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

// ─── Process Owners ───────────────────────────────────────────

export const getProcessOwners = async (
  req: AuthRequest,
  res: Response
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

    const data = controls.map((c) => ({
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
  req: AuthRequest,
  res: Response
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

    // Verify new owner belongs to company
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
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
      },
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
