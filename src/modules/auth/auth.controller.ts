import { Response, Request } from "express";
import { hashPassword, comparePassword } from "../../utils/password";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  verifyAccessToken,
  TokenPayload,
} from "../../utils/jwt";
import { prisma } from "../../config/prisma";
import { AuthRequest } from "../../middleware/authenticate";
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, fullName, companyName } = req.body;

    if (!email || !password || !fullName || !companyName) {
      res.status(400).json({ data: null, error: "All fields are required" });
      return;
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      res.status(409).json({ data: null, error: "Email already in use" });
      return;
    }

    const hashedPassword = await hashPassword(password);

    const slug =
      companyName.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();

    const user = await prisma.user.create({
      data: {
        email,
        fullName,
        password: hashedPassword,
      },
    });

    const company = await prisma.company.create({
      data: {
        name: companyName,
        slug,
        ownerId: user.id,
      },
    });

    await prisma.userCompany.create({
      data: {
        userId: user.id,
        companyId: company.id,
        role: "admin",
      },
    });

    const tokenPayload = {
      userId: user.id,
      companyId: company.id,
      role: "admin",
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.status(201).json({
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: "admin",
        },
        company: { id: company.id, name: company.name, slug: company.slug },
      },
      error: null,
    });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res
        .status(400)
        .json({ data: null, error: "Email and password are required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.password) {
      res
        .status(401)
        .json({ data: null, error: "User does not exist. Try signing up" });
      return;
    }

    const isValid = await comparePassword(password, user.password);
    if (!isValid) {
      res.status(401).json({ data: null, error: "Invalid credentials" });
      return;
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId: user.id },
      include: { company: true },
    });

    if (!userCompany) {
      res
        .status(403)
        .json({ data: null, error: "User is not linked to any company" });
      return;
    }

    const tokenPayload = {
      userId: user.id,
      companyId: userCompany.companyId,
      role: userCompany.role,
    };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: userCompany.role,
        },
        company: { id: userCompany.company.id, name: userCompany.company.name },
      },
      error: null,
    });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies.refreshToken;

    if (!token) {
      res.status(401).json({ data: null, error: "No refresh token provided" });
      return;
    }

    const payload = verifyRefreshToken(token);
    const accessToken = generateAccessToken({
      userId: payload.userId,
      companyId: payload.companyId,
      role: payload.role,
    });

    res.status(200).json({ data: { accessToken }, error: null });
  } catch (error) {
    res
      .status(401)
      .json({ data: null, error: "Invalid or expired refresh token" });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  res.clearCookie("refreshToken");
  res
    .status(200)
    .json({ data: { message: "Logged out successfully" }, error: null });
};

export const googleCallback = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const user = req.user as any;

    if (!user) {
      res.redirect(
        `${process.env.FRONTEND_URL}/login?error=google_auth_failed`,
      );
      return;
    }

    // Check if user has a company
    if (!user.userCompanies || user.userCompanies.length === 0) {
      // New user — no company yet
      // Generate a temporary token with just the userId
      const tempToken = generateAccessToken({
        userId: user.id,
        companyId: "pending",
        role: "pending",
      });

      res.redirect(
        `${process.env.FRONTEND_URL}/complete-registration?token=${tempToken}`,
      );
      return;
    }

    // Existing user — issue tokens
    const userCompany = user.userCompanies[0];
    const tokenPayload: TokenPayload = {
      userId: user.id,
      companyId: userCompany.companyId,
      role: userCompany.role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect(`${process.env.FRONTEND_URL}/dashboard?token=${accessToken}`);
  } catch (error) {
    res.redirect(`${process.env.FRONTEND_URL}/login?error=server_error`);
  }
};

export const completeGoogleRegistration = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { companyName, token } = req.body as {
      companyName: string;
      token: string;
    };

    if (!companyName || !token) {
      res
        .status(400)
        .json({ data: null, error: "Company name and token are required" });
      return;
    }

    // Verify temp token
    let payload: TokenPayload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      res.status(401).json({ data: null, error: "Invalid or expired token" });
      return;
    }

    if (payload.companyId !== "pending") {
      res.status(400).json({ data: null, error: "User already has a company" });
      return;
    }

    const userId = payload.userId;

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      res.status(404).json({ data: null, error: "User not found" });
      return;
    }

    const slug =
      companyName.toLowerCase().replace(/\s+/g, "-") + "-" + Date.now();

    const company = await prisma.company.create({
      data: {
        name: companyName,
        slug,
        ownerId: userId,
      },
    });

    await prisma.userCompany.create({
      data: {
        userId,
        companyId: company.id,
        role: "admin",
      },
    });

    const tokenPayload: TokenPayload = {
      userId,
      companyId: company.id,
      role: "admin",
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role: "admin",
        },
        company: { id: company.id, name: company.name, slug: company.slug },
      },
      error: null,
    });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

import crypto from "crypto";
import { sendEmail } from "../../utils/email";

export const forgotPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ data: null, error: "Email is required" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success even if user doesn't exist (security best practice)
    if (!user) {
      res.status(200).json({
        data: { message: "If that email exists, a reset link has been sent" },
        error: null,
      });
      return;
    }

    if (!user.password) {
      // Google OAuth user
      res.status(200).json({
        data: { message: "If that email exists, a reset link has been sent" },
        error: null,
      });
      return;
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiry = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

    await prisma.user.update({
      where: { email },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    await sendEmail({
      to: email,
      subject: "Reset your GRC Control Tool password",
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Reset your password</h2>
          <p>You requested a password reset. Click the button below to set a new password. This link expires in 1 hour.</p>
          <a href="${resetLink}" style="
            display: inline-block;
            padding: 12px 24px;
            background-color: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin-top: 16px;
          ">
            Reset Password
          </a>
          <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
            If you did not request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    res.status(200).json({
      data: { message: "If that email exists, a reset link has been sent" },
      error: null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      res
        .status(400)
        .json({ data: null, error: "Token and password are required" });
      return;
    }

    if (password.length < 8) {
      res
        .status(400)
        .json({ data: null, error: "Password must be at least 8 characters" });
      return;
    }

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      res
        .status(400)
        .json({ data: null, error: "Invalid or expired reset token" });
      return;
    }

    const hashedPassword = await hashPassword(password);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    res
      .status(200)
      .json({ data: { message: "Password reset successfully" }, error: null });
  } catch (error) {
    console.error(error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const getProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const companyId = req.user!.companyId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, fullName: true },
    });

    if (!user) {
      res.status(404).json({ data: null, error: "User not found" });
      return;
    }

    const userCompany = await prisma.userCompany.findFirst({
      where: { userId, companyId },
      include: { company: true },
    });

    const nameParts = user.fullName?.split(" ") ?? ["", ""];

    res.status(200).json({
      data: {
        id: user.id,
        email: user.email,
        firstName: nameParts[0] ?? "",
        lastName: nameParts.slice(1).join(" ") ?? "",
        fullName: user.fullName,
        role: userCompany?.role,
        organization: userCompany?.company?.name,
      },
      error: null,
    });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const updateProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { firstName, lastName } = req.body as {
      firstName: string;
      lastName: string;
    };

    if (!firstName || !lastName) {
      res
        .status(400)
        .json({ data: null, error: "First and last name are required" });
      return;
    }

    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    const user = await prisma.user.update({
      where: { id: userId },
      data: { fullName },
      select: { id: true, email: true, fullName: true },
    });

    res.status(200).json({
      data: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      error: null,
    });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const changePassword = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    if (!currentPassword || !newPassword) {
      res.status(400).json({ data: null, error: "All fields are required" });
      return;
    }

    if (newPassword.length < 8) {
      res
        .status(400)
        .json({ data: null, error: "Password must be at least 8 characters" });
      return;
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.password) {
      res
        .status(400)
        .json({ data: null, error: "Cannot change password for this account" });
      return;
    }

    const valid = await comparePassword(currentPassword, user.password);
    if (!valid) {
      res
        .status(401)
        .json({ data: null, error: "Current password is incorrect" });
      return;
    }

    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    res.status(200).json({
      data: { message: "Password changed successfully" },
      error: null,
    });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
