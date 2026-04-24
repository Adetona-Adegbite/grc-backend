import { Request, Response } from "express";
import { hashPassword, comparePassword } from "../../utils/password";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../utils/jwt";
import { prisma } from "../../config/prisma";

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
      res.status(401).json({ data: null, error: "Invalid credentials" });
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
