// Shared financial-year scheduling rules.
// Audits reuse these so an audit can never fall due in a month that control
// testing wouldn't — the audit schedule is derived, never entered by hand.

export const MONTH_NAMES = [
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

export const isControlDueInMonth = (
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

export interface FinancialYearMonth {
  month: string;
  monthNum: number;
  year: number;
  period: string;
}

// The 12 months of the financial year, in order, starting at its first month.
export const buildFinancialYearMonths = (
  financialYearStart: number,
  currentYear: number,
): FinancialYearMonth[] =>
  Array.from({ length: 12 }, (_, i) => {
    const monthNum = ((financialYearStart - 1 + i) % 12) + 1;
    const year = monthNum >= financialYearStart ? currentYear : currentYear + 1;
    return {
      month: MONTH_NAMES[monthNum - 1] as string,
      monthNum,
      year,
      period: `${year}-${String(monthNum).padStart(2, "0")}`,
    };
  });

// Clamp a chosen due day onto a real date in the given month (e.g. day 31 in
// February lands on the 28th/29th).
export const dueDateFor = (
  year: number,
  monthNum: number,
  dueDay: number,
): Date => {
  const lastDay = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  const day = Math.min(Math.max(dueDay, 1), lastDay);
  return new Date(Date.UTC(year, monthNum - 1, day));
};
