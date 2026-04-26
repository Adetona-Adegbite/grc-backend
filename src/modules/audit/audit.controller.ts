import { Response } from "express";
import { Request } from "express";
import { prisma } from "../../config/prisma";

const AUDIT_STEPS = [
  "Verify control is operating as designed",
  "Test a sample of transactions/items",
  "Review and verify evidence",
  "Document findings and conclusions",
];

export const getAudit = async (req: Request, res: Response): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { country_id } = req.query as { country_id: string };

    if (!country_id) {
      res.status(400).json({ data: null, error: "country_id is required" });
      return;
    }

    const controls = await prisma.control.findMany({
      where: { companyId, countryId: country_id, status: "active" },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
      },
      orderBy: [{ domain: "asc" }, { controlId: "asc" }],
    });

    // Group by domain
    const domainMap: Record<string, any[]> = {};

    controls.forEach((control) => {
      if (!domainMap[control.domain]) {
        domainMap[control.domain] = [];
      }
      domainMap[control.domain]!.push({
        id: control.id,
        controlId: control.controlId,
        name: control.name,
        domain: control.domain,
        risk: control.risk,
        frequency: control.frequency,
        owner: control.owner,
        auditSteps: AUDIT_STEPS,
      });
    });

    const data = Object.entries(domainMap).map(([domain, controls]) => ({
      domain,
      controls,
    }));

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
