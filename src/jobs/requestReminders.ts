import { prisma } from "../config/prisma";
import { sendEmail } from "../utils/email";
import { logAudit } from "../utils/auditLog";

// One reminder per request, sent once the date it was needed by has passed and
// the recipient still hasn't answered.
//
// The job is deliberately idempotent: `reminderSentAt` is stamped when the mail
// goes out, so running it repeatedly (or after a pm2 restart) can never chase
// the same person twice. That means the interval below is a safety net rather
// than something that has to be precise.

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly
const FIRST_RUN_DELAY_MS = 60 * 1000; // let the app settle after boot

export const sendDueRequestReminders = async (): Promise<number> => {
  const now = new Date();

  const overdue = await prisma.documentRequest.findMany({
    where: {
      status: "open", // "responded" and "closed" need no chasing
      dueDate: { not: null, lt: now },
      reminderSentAt: null,
    },
    include: {
      control: { select: { controlId: true, name: true } },
      requester: { select: { fullName: true, email: true } },
      recipient: { select: { id: true, fullName: true, email: true } },
      company: { select: { name: true } },
    },
  });

  if (overdue.length === 0) return 0;

  const appUrl = process.env.FRONTEND_URL ?? "";
  let sent = 0;

  for (const req of overdue) {
    if (!req.recipient?.email) continue;

    const daysLate = Math.max(
      1,
      Math.floor(
        (now.getTime() - new Date(req.dueDate as Date).getTime()) / 86_400_000,
      ),
    );

    try {
      await sendEmail({
        to: req.recipient.email,
        subject: `Reminder: ${req.requestId} — ${req.subject}`,
        html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>This request is still outstanding</h2>
          <p>A document request from
          <strong>${req.requester.fullName ?? req.requester.email}</strong>
          passed its due date ${daysLate} day${daysLate > 1 ? "s" : ""} ago and
          has not been answered.</p>
          <table style="border-collapse: collapse; margin: 16px 0; font-size: 14px;">
            <tr><td style="padding: 4px 12px 4px 0; color: #555;">Reference</td><td><strong>${req.requestId}</strong></td></tr>
            <tr><td style="padding: 4px 12px 4px 0; color: #555;">Control</td><td>${req.control.controlId} — ${req.control.name}</td></tr>
            <tr><td style="padding: 4px 12px 4px 0; color: #555;">Period</td><td>${req.period}</td></tr>
            <tr><td style="padding: 4px 12px 4px 0; color: #555;">Was needed by</td><td>${new Date(req.dueDate as Date).toDateString()}</td></tr>
          </table>
          <p style="background: #f6f6f6; border-left: 3px solid #d97706; padding: 12px; white-space: pre-wrap;">${req.message}</p>
          <a href="${appUrl}/requests" style="
            display: inline-block;
            padding: 12px 24px;
            background-color: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin-top: 16px;
          ">Respond now</a>
          <p style="color:#777; font-size:12px; margin-top:20px;">
            This is the only reminder that will be sent for this request.
          </p>
        </div>`,
      });

      await prisma.documentRequest.update({
        where: { id: req.id },
        data: { reminderSentAt: new Date() },
      });

      await logAudit({
        companyId: req.companyId,
        userId: req.requesterId,
        action: "request_reminder_sent",
        entityType: "request",
        entityId: req.id,
        detail: `Reminder sent to ${req.recipient.email} for ${req.requestId}`,
      });

      sent += 1;
    } catch (err) {
      // Leave reminderSentAt unset so the next run retries this one.
      console.error(
        `[reminders] failed for ${req.requestId} —`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (sent > 0) console.log(`[reminders] sent ${sent} overdue reminder(s)`);
  return sent;
};

export const startRequestReminderJob = (): void => {
  const run = () => {
    sendDueRequestReminders().catch((err) =>
      console.error("[reminders] job error:", err),
    );
  };

  setTimeout(run, FIRST_RUN_DELAY_MS);
  setInterval(run, CHECK_INTERVAL_MS);
  console.log("[reminders] overdue request reminder job scheduled (hourly)");
};
