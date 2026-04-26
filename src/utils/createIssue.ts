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

export const createIssueHelper = async (params: CreateIssueParams) => {
  return prisma.$transaction(async (tx) => {
    const count = await tx.issue.count({
      where: { companyId: params.companyId },
    });
    const issueId = `ISS-${String(count + 1).padStart(3, "0")}`;

    return tx.issue.create({
      data: {
        issueId,
        companyId: params.companyId,
        countryId: params.countryId,
        controlId: params.controlId,
        description: params.description,
        severity: params.severity,
        status: "open",
        ...(params.testResultId !== undefined && {
          testResultId: params.testResultId,
        }),
        ...(params.ownerId !== undefined && { ownerId: params.ownerId }),
      },
    });
  });
};
