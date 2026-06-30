import { prisma } from "../config/prisma";

interface CreateIssueParams {
  companyId: string;
  countryId: string;
  controlId: string;
  testResultId?: string;
  description: string;
  severity: "low" | "medium" | "high";
  ownerId?: string | null;
}

// Next issue id based on the MAX existing number (not a count) so deleted
// issues don't cause "ISS-00x already exists" collisions.
const nextIssueId = async (tx: any, companyId: string, offset = 0) => {
  const issues = await tx.issue.findMany({
    where: { companyId },
    select: { issueId: true },
  });
  let max = 0;
  for (const i of issues) {
    const n = parseInt(String(i.issueId).replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `ISS-${String(max + 1 + offset).padStart(3, "0")}`;
};

export const createIssueHelper = async (params: CreateIssueParams) => {
  const data = (issueId: string) => ({
    issueId,
    companyId: params.companyId,
    countryId: params.countryId,
    controlId: params.controlId,
    description: params.description,
    severity: params.severity,
    status: "open" as const,
    ...(params.testResultId !== undefined && {
      testResultId: params.testResultId,
    }),
    ...(params.ownerId !== undefined && { ownerId: params.ownerId }),
  });

  // Retry past an issueId clash under concurrency / stale numbering.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx: any) => {
        const issueId = await nextIssueId(tx, params.companyId, attempt);
        return tx.issue.create({ data: data(issueId) });
      });
    } catch (err: any) {
      const target = err?.meta?.target;
      const isIssueIdClash =
        err?.code === "P2002" &&
        (Array.isArray(target)
          ? target.includes("issueId")
          : String(target ?? "").includes("issueId"));
      if (isIssueIdClash && attempt < 4) continue;
      throw err;
    }
  }
};
