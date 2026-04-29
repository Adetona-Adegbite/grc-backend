import { Response } from "express";
import { Request } from "express";
import { sendEmail } from "../../utils/email";
import { prisma } from "../../config/prisma";
import { comparePassword, hashPassword } from "../../utils/password";
import { generateAccessToken, generateRefreshToken } from "../../utils/jwt";

export const sendInvite = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const invitedBy = req.user!.userId;
    const { email, role } = req.body as { email: string; role: string };

    if (!email || !role) {
      res
        .status(400)
        .json({ data: null, error: "Email and role are required" });
      return;
    }

    const validRoles = ["control_owner", "tester", "viewer"];
    if (!validRoles.includes(role)) {
      res.status(400).json({ data: null, error: "Invalid role" });
      return;
    }

    // Check if user is already a member
    const existingMember = await prisma.user.findUnique({ where: { email } });
    if (existingMember) {
      const alreadyMember = await prisma.userCompany.findFirst({
        where: { userId: existingMember.id, companyId },
      });
      if (alreadyMember) {
        res.status(409).json({
          data: null,
          error: "User is already a member of this company",
        });
        return;
      }
    }

    // // Check if there's already a pending invite
    // const existingInvite = await prisma.invite.findFirst({
    //   where: { email, companyId, status: "pending" },
    // });
    // if (existingInvite) {
    //   res.status(409).json({
    //     data: null,
    //     error: "An invite has already been sent to this email",
    //   });
    //   return;
    // }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invite = await prisma.invite.create({
      data: {
        companyId,
        email,
        role: role as any,
        invitedBy,
        expiresAt,
      },
    });

    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    const inviteLink = `${process.env.FRONTEND_URL}/accept-invite?token=${invite.token}`;

    await sendEmail({
      to: email,
      subject: `You've been invited to join ${company?.name} on GRC Control Tool`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You've been invited</h2>
          <p>You have been invited to join <strong>${
            company?.name
          }</strong> as a <strong>${role.replace("_", " ")}</strong>.</p>
          <p>Click the link below to accept your invitation. This link expires in 7 days.</p>
          <a href="${inviteLink}" style="
            display: inline-block;
            padding: 12px 24px;
            background-color: #2563eb;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            margin-top: 16px;
          ">
            Accept Invitation
          </a>
          <p style="margin-top: 24px; color: #6b7280; font-size: 14px;">
            If you did not expect this invitation, you can ignore this email.
          </p>
        </div>
      `,
    });

    res
      .status(201)
      .json({ data: { message: "Invite sent successfully" }, error: null });
  } catch (error) {
    console.error("Error Sending Invite:", error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const acceptInvite = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const token = req.params.token;

    if (!token || Array.isArray(token)) {
      res.status(400).json({ data: null, error: "Invalid token" });
      return;
    }

    const { fullName, password } = req.body as {
      fullName?: string;
      password: string;
    };

    if (!password) {
      res.status(400).json({ data: null, error: "Password is required" });
      return;
    }

    // 1. Get invite
    const invite = await prisma.invite.findUnique({
      where: { token },
    });

    if (!invite) {
      res.status(404).json({ data: null, error: "Invalid invite" });
      return;
    }

    if (invite.status !== "pending") {
      res.status(400).json({ data: null, error: "Invite already used" });
      return;
    }

    if (new Date() > invite.expiresAt) {
      await prisma.invite.update({
        where: { token },
        data: { status: "expired" },
      });

      res.status(400).json({ data: null, error: "Invite expired" });
      return;
    }

    // 2. Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { email: invite.email },
      include: {
        userCompanies: true,
      },
    });

    let user = existingUser;

    let isNewUser = false;

    // 3. CREATE USER (NEW USER FLOW)
    if (!user) {
      if (!fullName) {
        res.status(400).json({
          data: { type: "new_user" },
          error: "FULL_NAME_REQUIRED",
        });
        return;
      }

      const hashedPassword = await hashPassword(password);

      user = await prisma.user.create({
        data: {
          email: invite.email,
          fullName,
          password: hashedPassword,
        },
        include: {
          userCompanies: true,
        },
      });

      isNewUser = true;
    } else {
      // 4. EXISTING USER → verify password
      const valid = await comparePassword(password, user.password!);

      if (!valid) {
        res.status(401).json({
          data: { type: "existing_user" },
          error: "INVALID_PASSWORD",
        });
        return;
      }
    }

    // 5. Attach to company (if not already)
    const existingLink = await prisma.userCompany.findFirst({
      where: {
        userId: user.id,
        companyId: invite.companyId,
      },
    });

    if (!existingLink) {
      await prisma.userCompany.create({
        data: {
          userId: user.id,
          companyId: invite.companyId,
          role: invite.role,
          invitedBy: invite.invitedBy,
        },
      });
    }

    // 6. Mark invite as accepted
    await prisma.invite.update({
      where: { token },
      data: { status: "accepted" },
    });

    // 7. Get company
    const company = await prisma.company.findUnique({
      where: { id: invite.companyId },
    });

    // 8. ROLE (take from invite)
    const role = invite.role;

    // 9. TOKENS (same as login/register)
    const tokenPayload = {
      userId: user.id,
      companyId: invite.companyId,
      role,
    };

    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    // 10. RESPONSE (MATCH LOGIN/REGISTER EXACTLY)
    res.status(200).json({
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.fullName,
          role,
        },
        company: {
          id: company?.id,
          name: company?.name,
        },
        meta: {
          isNewUser,
        },
      },
      error: null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const getInvites = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;

    const invites = await prisma.invite.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        inviter: { select: { fullName: true, email: true } },
      },
    });

    res.status(200).json({ data: invites, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const revokeInvite = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };

    const invite = await prisma.invite.findFirst({ where: { id, companyId } });

    if (!invite) {
      res.status(404).json({ data: null, error: "Invite not found" });
      return;
    }

    if (invite.status !== "pending") {
      res
        .status(400)
        .json({ data: null, error: "Only pending invites can be revoked" });
      return;
    }

    await prisma.invite.delete({ where: { id } });

    res.status(200).json({ data: { message: "Invite revoked" }, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const getInviteByToken = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const token = req.params.token;

    if (!token || Array.isArray(token)) {
      res.status(400).json({ data: null, error: "Invalid token" });
      return;
    }
    const invite = await prisma.invite.findUnique({
      where: { token },
      select: {
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        company: { select: { name: true } },
        inviter: { select: { fullName: true, email: true } },
      },
    });

    if (!invite) {
      res.status(404).json({ data: null, error: "Invite not found" });
      return;
    }

    res.status(200).json({
      data: {
        email: invite.email,
        role: invite.role,
        status: invite.status,
        expiresAt: invite.expiresAt,
        companyName: invite.company?.name,
        invitedByName: invite.inviter?.fullName,
        invitedByEmail: invite.inviter?.email,
      },
      error: null,
    });
  } catch (err) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const declineInvite = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const token = req.params.token;

    if (!token || Array.isArray(token)) {
      res.status(400).json({ data: null, error: "Invalid token" });
      return;
    }
    const invite = await prisma.invite.findUnique({ where: { token } });

    if (!invite) {
      res.status(404).json({ data: null, error: "Invite not found" });
      return;
    }

    if (invite.status !== "pending") {
      res.status(400).json({ data: null, error: "Invite is not pending" });
      return;
    }

    await prisma.invite.update({
      where: { token },
      data: { status: "declined" },
    });

    res.status(200).json({ data: { message: "Invite declined" }, error: null });
  } catch (err) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
