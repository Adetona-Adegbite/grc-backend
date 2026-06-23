import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // Fail fast instead of hanging the request if the SMTP host is unreachable.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
});

// Log SMTP readiness once at startup so deploy logs show immediately whether
// the mail credentials/host actually work — instead of failing silently later.
transporter
  .verify()
  .then(() => console.log("[email] SMTP transporter ready ✅"))
  .catch((err: unknown) =>
    console.error(
      "[email] SMTP transporter NOT ready ❌ —",
      err instanceof Error ? err.message : err,
    ),
  );

export const sendEmail = async ({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> => {
  try {
    const info = await transporter.sendMail({
      from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
      to,
      subject,
      html,
    });
    console.log(`[email] sent to ${to} (messageId=${info.messageId})`);
  } catch (err) {
    // Surface the real reason (bad credentials, blocked port, etc.) in the
    // server logs rather than swallowing it.
    console.error(
      `[email] FAILED to send to ${to} —`,
      err instanceof Error ? err.message : err,
    );
    throw err;
  }
};
