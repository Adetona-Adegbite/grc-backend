import { prisma } from "../config/prisma";

interface AuditLogParams {
  companyId: string;
  userId: string;
  action: string;
  entityType:
    | "test"
    | "issue"
    | "action"
    | "control"
    | "country"
    | "invite"
    | "user"
    | "company";
  entityId: string;
  detail?: string;
}

export const logAudit = async (params: AuditLogParams): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        companyId: params.companyId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        ...(params.detail !== undefined && { detail: params.detail }),
      },
    });
  } catch (error) {
    // Audit log failure should never break the main flow
    console.error("Audit log error:", error);
  }
};
