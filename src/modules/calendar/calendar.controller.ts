import { Response, Request } from "express";
import { prisma } from "../../config/prisma";

const isControlDueInMonth = (
  frequency: string,
  monthNum: number,
  financialYearStart: number,
): boolean => {
  if (frequency === "monthly") return true;

  if (frequency === "annual") {
    return monthNum === financialYearStart;
  }

  if (frequency === "quarterly") {
    const diff = (monthNum - financialYearStart + 12) % 12;
    return diff % 3 === 0;
  }

  if (frequency === "semi_annually") {
    const diff = (monthNum - financialYearStart + 12) % 12;
    return diff % 6 === 0;
  }

  if (frequency === "as_needed") return false;

  return false;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const getCalendar = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { country_id, year } = req.query as {
      country_id?: string;
      year?: string;
    };
    const countryWhere =
      country_id && country_id !== "all" ? { countryId: country_id } : {};

    if (!country_id) {
      res.status(400).json({ data: null, error: "country_id is required" });
      return;
    }

    const currentYear = year ? parseInt(year) : new Date().getFullYear();

    // Get company financial year start
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { financialYearStart: true },
    });

    if (!company) {
      res.status(404).json({ data: null, error: "Company not found" });
      return;
    }

    const financialYearStart = company.financialYearStart;

    // Get all active controls for this country
    const controls = await prisma.control.findMany({
      where: {
        companyId,
        ...countryWhere,
        status: "active",
        ownerId: { not: null },
      },
      select: {
        id: true,
        controlId: true,
        name: true,
        frequency: true,
      },
    });

    // Build 12 months starting from financial year start
    const calendar = Array.from({ length: 12 }, (_, i) => {
      const monthNum = ((financialYearStart - 1 + i) % 12) + 1;

      // Determine year for this month
      const monthYear =
        monthNum >= financialYearStart ? currentYear : currentYear + 1;

      const dueControls = controls.filter((control: any) =>
        isControlDueInMonth(control.frequency, monthNum, financialYearStart),
      );

      return {
        month: MONTH_NAMES[monthNum - 1],
        monthNum,
        year: monthYear,
        period: `${monthYear}-${String(monthNum).padStart(2, "0")}`,
        totalControls: dueControls.length,
        controls: dueControls.map((c: any) => ({
          controlId: c.controlId,
          name: c.name,
          frequency: c.frequency,
        })),
      };
    });

    res.status(200).json({
      data: {
        financialYearStart: MONTH_NAMES[financialYearStart - 1],
        year: currentYear,
        calendar,
      },
      error: null,
    });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
