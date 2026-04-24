import { Response } from "express";
import { AuthRequest } from "../../middleware/authenticate";
import { prisma } from "../../config/prisma";

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
