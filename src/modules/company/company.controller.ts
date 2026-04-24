import { Response } from "express";
import { AuthRequest } from "../../middleware/authenticate";
import { prisma } from "../../config/prisma";

export const getCompanyMembers = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const q = req.query.q as string | undefined;

    const members = await prisma.userCompany.findMany({
      where: {
        companyId,
        ...(q && {
          user: {
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
        }),
      },
      select: {
        role: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
          },
        },
      },
      orderBy: {
        user: { fullName: "asc" },
      },
    });

    const data = members.map((m) => ({
      id: m.user.id,
      fullName: m.user.fullName,
      email: m.user.email,
      role: m.role,
    }));

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
