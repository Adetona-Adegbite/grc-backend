import { Response } from "express";
import { AuthRequest } from "../../middleware/authenticate";
import { sendEmail } from "../../utils/email";
import { prisma } from "../../config/prisma";
import { hashPassword } from "../../utils/password";

export const sendInvite = async (
  req: AuthRequest,
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

    // Check if there's already a pending invite
    const existingInvite = await prisma.invite.findFirst({
      where: { email, companyId, status: "pending" },
    });
    if (existingInvite) {
      res.status(409).json({
        data: null,
        error: "An invite has already been sent to this email",
      });
      return;
    }

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
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const acceptInvite = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { token, password, fullName } = req.body as {
      token: string;
      password: string;
      fullName: string;
    };

    if (!token || !password || !fullName) {
      res.status(400).json({
        data: null,
        error: "Token, full name and password are required",
      });
      return;
    }

    const invite = await prisma.invite.findUnique({ where: { token } });

    if (!invite) {
      res.status(404).json({ data: null, error: "Invalid invite token" });
      return;
    }

    if (invite.status !== "pending") {
      res
        .status(400)
        .json({ data: null, error: "Invite has already been used or expired" });
      return;
    }

    if (new Date() > invite.expiresAt) {
      await prisma.invite.update({
        where: { token },
        data: { status: "expired" },
      });
      res.status(400).json({ data: null, error: "Invite has expired" });
      return;
    }

    // Check if user already exists
    let user = await prisma.user.findUnique({ where: { email: invite.email } });

    if (!user) {
      const hashedPassword = await hashPassword(password);

      user = await prisma.user.create({
        data: {
          email: invite.email,
          fullName,
          password: hashedPassword,
        },
      });
    }

    // Link user to company with the invited role
    await prisma.userCompany.create({
      data: {
        userId: user.id,
        companyId: invite.companyId,
        role: invite.role,
        invitedBy: invite.invitedBy,
      },
    });

    // Mark invite as accepted
    await prisma.invite.update({
      where: { token },
      data: { status: "accepted" },
    });

    res
      .status(200)
      .json({ data: { message: "Invite accepted successfully" }, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const getInvites = async (
  req: AuthRequest,
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
  req: AuthRequest,
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
