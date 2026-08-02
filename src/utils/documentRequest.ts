import { prisma } from "../config/prisma";
import { sendEmail } from "./email";

// Shared by the Requests tab and by audits, so a request raised from either
// place is the same kind of record: one list, one status model, one reminder.

export const REQUEST_INCLUDE = {
  control: { select: { id: true, controlId: true, name: true, domain: true } },
  requester: { select: { id: true, fullName: true, email: true } },
  recipient: { select: { id: true, fullName: true, email: true } },
  audit: { select: { id: true, auditId: true, auditName: true } },
  messages: {
    include: {
      author: { select: { id: true, fullName: true, email: true } },
    },
    orderBy: { createdAt: "asc" as const },
  },
};

// Next id based on the MAX existing number (not a count) so deleted rows don't
// cause "REQ-00x already exists" collisions.
const nextRequestId = async (tx: any, companyId: string, offset = 0) => {
  const rows = await tx.documentRequest.findMany({
    where: { companyId },
    select: { requestId: true },
  });
  let max = 0;
  for (const row of rows) {
    const n = parseInt(String(row.requestId).replace(/\D/g, ""), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `REQ-${String(max + 1 + offset).padStart(3, "0")}`;
};

const isIdClash = (err: any) => {
  const target = err?.meta?.target;
  return (
    err?.code === "P2002" &&
    (Array.isArray(target)
      ? target.includes("requestId")
      : String(target ?? "").includes("requestId"))
  );
};

interface CreateParams {
  companyId: string;
  countryId: string;
  controlId: string;
  requesterId: string;
  recipientId: string;
  period: string;
  subject: string;
  message: string;
  dueDate?: string | Date | null;
  auditId?: string | null;
}

export const createDocumentRequest = async (params: CreateParams) => {
  let created: any;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      created = await prisma.$transaction(async (tx: any) => {
        const requestId = await nextRequestId(tx, params.companyId, attempt);
        return tx.documentRequest.create({
          data: {
            requestId,
            companyId: params.companyId,
            countryId: params.countryId,
            controlId: params.controlId,
            requesterId: params.requesterId,
            recipientId: params.recipientId,
            period: params.period,
            subject: params.subject,
            message: params.message,
            ...(params.dueDate ? { dueDate: new Date(params.dueDate) } : {}),
            ...(params.auditId ? { auditId: params.auditId } : {}),
          },
          include: REQUEST_INCLUDE,
        });
      });
      break;
    } catch (err: any) {
      if (isIdClash(err) && attempt < 4) continue;
      throw err;
    }
  }

  // Notify the recipient. A mail failure must never lose the request.
  let emailSent = false;
  let emailError: string | null = null;
  if (created?.recipient?.email) {
    const appUrl = process.env.FRONTEND_URL ?? "";
    const who = created.requester.fullName ?? created.requester.email;
    try {
      await sendEmail({
        to: created.recipient.email,
        subject: `Document request ${created.requestId}: ${created.subject}`,
        html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>You have a new document request</h2>
        <p><strong>${who}</strong> has requested information from you.</p>
        <table style="border-collapse: collapse; margin: 16px 0; font-size: 14px;">
          <tr><td style="padding: 4px 12px 4px 0; color: #555;">Reference</td><td><strong>${created.requestId}</strong></td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #555;">Control</td><td>${created.control.controlId} — ${created.control.name}</td></tr>
          <tr><td style="padding: 4px 12px 4px 0; color: #555;">Period</td><td>${created.period}</td></tr>
          ${
            created.audit
              ? `<tr><td style="padding: 4px 12px 4px 0; color: #555;">Audit</td><td>${created.audit.auditId} — ${created.audit.auditName}</td></tr>`
              : ""
          }
          ${
            created.dueDate
              ? `<tr><td style="padding: 4px 12px 4px 0; color: #555;">Needed by</td><td>${new Date(created.dueDate).toDateString()}</td></tr>`
              : ""
          }
        </table>
        <p style="background: #f6f6f6; border-left: 3px solid #2563eb; padding: 12px; white-space: pre-wrap;">${created.message}</p>
        <p>Log in to reply and upload the documents requested.</p>
        <a href="${appUrl}/requests" style="
          display: inline-block;
          padding: 12px 24px;
          background-color: #2563eb;
          color: white;
          text-decoration: none;
          border-radius: 6px;
          margin-top: 16px;
        ">Open the GRC Control Tool</a>
      </div>`,
      });
      emailSent = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : "Email failed";
    }
  }

  return { request: created, emailSent, emailError };
};
