import { Response } from "express";
import { Request } from "express";
import { prisma } from "../../config/prisma";
import { logAudit } from "../../utils/auditLog";
import { sendEmail } from "../../utils/email";
import {
  createDocumentRequest,
  REQUEST_INCLUDE,
} from "../../utils/documentRequest";

const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

// Control owners are respondents: they only ever see requests addressed to
// them, never other people's.
const isResponder = (role: string) => role === "control_owner";

const appLink = () => `${process.env.FRONTEND_URL ?? ""}/requests`;

const emailShell = (title: string, body: string) => `
  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
    <h2>${title}</h2>
    ${body}
    <a href="${appLink()}" style="
      display: inline-block;
      padding: 12px 24px;
      background-color: #2563eb;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin-top: 16px;
    ">Open the GRC Control Tool</a>
  </div>`;

const detailRows = (req: any) => `
  <table style="border-collapse: collapse; margin: 16px 0; font-size: 14px;">
    <tr><td style="padding: 4px 12px 4px 0; color: #555;">Reference</td><td><strong>${req.requestId}</strong></td></tr>
    <tr><td style="padding: 4px 12px 4px 0; color: #555;">Control</td><td>${req.control.controlId} — ${req.control.name}</td></tr>
    <tr><td style="padding: 4px 12px 4px 0; color: #555;">Period</td><td>${req.period}</td></tr>
    ${
      req.dueDate
        ? `<tr><td style="padding: 4px 12px 4px 0; color: #555;">Needed by</td><td>${new Date(
            req.dueDate,
          ).toDateString()}</td></tr>`
        : ""
    }
  </table>`;

export const getRequests = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const { country_id, status } = req.query as {
      country_id?: string;
      status?: string;
    };
    const countryWhere =
      country_id && country_id !== "all" ? { countryId: country_id } : {};
    const statusWhere =
      status && status !== "all" ? { status: status as any } : {};

    // Responders see only what was addressed to them.
    const scopeWhere = isResponder(role) ? { recipientId: userId } : {};

    const requests = await prisma.documentRequest.findMany({
      where: { companyId, ...countryWhere, ...statusWhere, ...scopeWhere },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: "desc" },
    });

    res.status(200).json({ data: requests, error: null });
  } catch (error) {
    console.error("[getRequests] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const createRequest = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const { controlId, period, recipientId, subject, message, dueDate } =
      req.body ?? {};

    if (!controlId || !recipientId) {
      res
        .status(400)
        .json({ data: null, error: "controlId and recipientId are required" });
      return;
    }
    if (!subject || !String(subject).trim()) {
      res.status(400).json({ data: null, error: "subject is required" });
      return;
    }
    if (!message || !String(message).trim()) {
      res.status(400).json({ data: null, error: "message is required" });
      return;
    }
    if (!period || !PERIOD_RE.test(String(period))) {
      res
        .status(400)
        .json({ data: null, error: "period must be in YYYY-MM format" });
      return;
    }

    const control = await prisma.control.findFirst({
      where: { id: String(controlId), companyId },
    });
    if (!control) {
      res.status(404).json({ data: null, error: "Control not found" });
      return;
    }

    const recipient = await prisma.userCompany.findFirst({
      where: { userId: String(recipientId), companyId },
      include: { user: { select: { email: true, fullName: true } } },
    });
    if (!recipient) {
      res.status(400).json({
        data: null,
        error: "Recipient is not a member of this company",
      });
      return;
    }

    const { request: created, emailSent, emailError } =
      await createDocumentRequest({
        companyId,
        countryId: control.countryId,
        controlId: control.id,
        requesterId: userId,
        recipientId: String(recipientId),
        period: String(period),
        subject: String(subject).trim(),
        message: String(message).trim(),
        dueDate: dueDate ?? null,
      });

    await logAudit({
      companyId,
      userId,
      action: "request_sent",
      entityType: "request",
      entityId: created.id,
      detail: `Requested "${created.subject}" from ${recipient.user.email} for ${control.controlId} ${created.period}`,
    });

    res.status(201).json({
      data: { ...created, emailSent, emailError },
      error: null,
    });
  } catch (error) {
    console.error("[createRequest] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

// Either side can reply. Replying notifies the other party.
export const replyToRequest = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const role = req.user!.role;
    const { id } = req.params as { id: string };
    const { message, evidenceUrls } = req.body ?? {};

    if (!message || !String(message).trim()) {
      res.status(400).json({ data: null, error: "message is required" });
      return;
    }

    const request = await prisma.documentRequest.findFirst({
      where: { id, companyId },
      include: REQUEST_INCLUDE,
    });
    if (!request) {
      res.status(404).json({ data: null, error: "Request not found" });
      return;
    }
    if (isResponder(role) && request.recipientId !== userId) {
      res.status(403).json({ data: null, error: "Access denied" });
      return;
    }

    const reply = await prisma.documentRequestMessage.create({
      data: {
        requestId: id,
        companyId,
        authorId: userId,
        message: String(message).trim(),
        ...(Array.isArray(evidenceUrls) && {
          evidenceUrls: evidenceUrls.map(String),
        }),
      },
      include: {
        author: { select: { id: true, fullName: true, email: true } },
      },
    });

    // The recipient answering moves it to "responded"; the requester chasing
    // leaves the status alone.
    const fromRecipient = request.recipientId === userId;
    if (fromRecipient && request.status === "open") {
      await prisma.documentRequest.update({
        where: { id },
        data: { status: "responded" },
      });
    }

    // Tell the other party.
    const notify = fromRecipient ? request.requester : request.recipient;
    let emailSent = false;
    let emailError: string | null = null;
    if (notify?.email) {
      try {
        await sendEmail({
          to: notify.email,
          subject: `${fromRecipient ? "Response to" : "Update on"} ${request.requestId}: ${request.subject}`,
          html: emailShell(
            fromRecipient ? "Your request has a response" : "Request updated",
            `<p><strong>${reply.author.fullName ?? reply.author.email}</strong> ${
              fromRecipient ? "responded to your request" : "added a message"
            }.</p>
             ${detailRows(request)}
             <p style="background: #f6f6f6; border-left: 3px solid #2563eb; padding: 12px; white-space: pre-wrap;">${reply.message}</p>
             ${
               reply.evidenceUrls.length > 0
                 ? `<p>${reply.evidenceUrls.length} file(s) attached.</p>`
                 : ""
             }`,
          ),
        });
        emailSent = true;
      } catch (err) {
        emailError = err instanceof Error ? err.message : "Email failed";
      }
    }

    await logAudit({
      companyId,
      userId,
      action: "request_replied",
      entityType: "request",
      entityId: id,
      detail: `Replied on ${request.requestId}`,
    });

    res.status(201).json({
      data: { ...reply, emailSent, emailError },
      error: null,
    });
  } catch (error) {
    console.error("[replyToRequest] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

// Only the requesting side closes or reopens a request.
export const updateRequestStatus = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const { id } = req.params as { id: string };
    const { status } = req.body ?? {};

    if (!["open", "responded", "closed"].includes(String(status))) {
      res.status(400).json({
        data: null,
        error: "status must be open, responded or closed",
      });
      return;
    }

    const existing = await prisma.documentRequest.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      res.status(404).json({ data: null, error: "Request not found" });
      return;
    }

    const updated = await prisma.documentRequest.update({
      where: { id },
      data: { status: status as any },
      include: REQUEST_INCLUDE,
    });

    await logAudit({
      companyId,
      userId,
      action: "request_status_changed",
      entityType: "request",
      entityId: id,
      detail: `${existing.requestId} marked ${status}`,
    });

    res.status(200).json({ data: updated, error: null });
  } catch (error) {
    console.error("[updateRequestStatus] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const deleteRequest = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const userId = req.user!.userId;
    const { id } = req.params as { id: string };

    const existing = await prisma.documentRequest.findFirst({
      where: { id, companyId },
    });
    if (!existing) {
      res.status(404).json({ data: null, error: "Request not found" });
      return;
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.documentRequestMessage.deleteMany({ where: { requestId: id } });
      await tx.documentRequest.delete({ where: { id } });
    });

    await logAudit({
      companyId,
      userId,
      action: "deleted",
      entityType: "request",
      entityId: id,
      detail: `Deleted request ${existing.requestId}`,
    });

    res.status(200).json({ data: { id }, error: null });
  } catch (error) {
    console.error("[deleteRequest] error:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
