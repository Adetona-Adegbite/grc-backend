import dotenv from "dotenv";

dotenv.config();

const requiredEnvVars = [
  "DATABASE_URL",
  "ACCESS_TOKEN_SECRET",
  "REFRESH_TOKEN_SECRET",
  "FRONTEND_URL",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "FROM_EMAIL",
  "FROM_NAME",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_CALLBACK_URL",
];

export const validateEnv = (): void => {
  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((key) => console.error(`  - ${key}`));
    process.exit(1);
  }

  console.log("✅ Environment variables validated");
};

export const env = {
  port: process.env.PORT || 5000,
  databaseUrl: process.env.DATABASE_URL!,
  accessTokenSecret: process.env.ACCESS_TOKEN_SECRET!,
  refreshTokenSecret: process.env.REFRESH_TOKEN_SECRET!,
  frontendUrl: process.env.FRONTEND_URL!,
  smtp: {
    host: process.env.SMTP_HOST!,
    port: Number(process.env.SMTP_PORT),
    user: process.env.SMTP_USER!,
    pass: process.env.SMTP_PASS!,
    fromEmail: process.env.FROM_EMAIL!,
    fromName: process.env.FROM_NAME!,
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    callbackUrl: process.env.GOOGLE_CALLBACK_URL!,
  },
};
