import { Response } from "express";
import { AuthRequest } from "../../middleware/authenticate";
import { prisma } from "../../config/prisma";
import { logAudit } from "../../utils/auditLog";

const generateIssueId = async (companyId: string): Promise<string> => {
  const count = await prisma.issue.count({ where: { companyId } });
  return `ISS-${String(count + 1).padStart(3, "0")}`;
};

const computeRAG = (dueDate: Date | null, status: string): string => {
  if (status === "closed") return "green";
  if (!dueDate) return "grey";

  const today = new Date();
  const due = new Date(dueDate);
  const diffDays = Math.ceil(
    (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return "red";
  if (diffDays <= 7) return "amber";
  return "green";
};

export const getIssues = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { country_id, status } = req.query as {
      country_id: string;
      status?: string;
    };

    if (!country_id) {
      res.status(400).json({ data: null, error: "country_id is required" });
      return;
    }

    const issues = await prisma.issue.findMany({
      where: {
        companyId,
        countryId: country_id,
        ...(status && status !== "all" && { status: status as any }),
      },
      include: {
        control: { select: { controlId: true, name: true, domain: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        actions: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const data = issues.map((issue: any) => ({
      ...issue,
      age: Math.ceil(
        (new Date().getTime() - new Date(issue.createdAt).getTime()) /
          (1000 * 60 * 60 * 24)
      ),
      rag: computeRAG(issue.dueDate, issue.status),
    }));

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const createIssue = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { countryId, controlId, description, severity, ownerId, dueDate } =
      req.body as {
        countryId: string;
        controlId: string;
        description: string;
        severity?: string;
        ownerId?: string;
        dueDate?: string;
      };

    if (!countryId || !controlId || !description) {
      res.status(400).json({
        data: null,
        error: "countryId, controlId and description are required",
      });
      return;
    }

    const control = await prisma.control.findFirst({
      where: { id: controlId, companyId },
    });

    if (!control) {
      res.status(404).json({ data: null, error: "Control not found" });
      return;
    }

    const issueId = await generateIssueId(companyId);

    const issue = await prisma.issue.create({
      data: {
        issueId,
        companyId,
        countryId,
        controlId,
        description,
        severity: (severity as any) || "medium",
        ownerId: ownerId || control.ownerId || null,
        status: "open",
        ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
      },
    });
    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Issue raised",
      entityType: "issue",
      entityId: issue.id,
      detail: `${issue.issueId} — ${
        issue.severity.charAt(0).toUpperCase() + issue.severity.slice(1)
      }`,
    });
    res.status(201).json({ data: issue, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const updateIssue = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };
    const { severity, status, ownerId, dueDate, description } = req.body as {
      severity?: string;
      status?: string;
      ownerId?: string;
      dueDate?: string;
      description?: string;
    };

    const existing = await prisma.issue.findFirst({ where: { id, companyId } });

    if (!existing) {
      res.status(404).json({ data: null, error: "Issue not found" });
      return;
    }

    const issue = await prisma.issue.update({
      where: { id },
      data: {
        ...(severity !== undefined && { severity: severity as any }),
        ...(status !== undefined && { status: status as any }),
        ...(ownerId !== undefined && { ownerId }),
        ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
        ...(description !== undefined && { description }),
      },
    });
    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Issue updated",
      entityType: "issue",
      entityId: issue.id,
      detail: `${issue.issueId} — ${issue.status}`,
    });
    res.status(200).json({ data: issue, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const getIssue = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };

    const issue = await prisma.issue.findFirst({
      where: { id, companyId },
      include: {
        control: { select: { controlId: true, name: true, domain: true } },
        owner: { select: { id: true, fullName: true, email: true } },
        testResult: true,
        actions: {
          include: {
            owner: { select: { id: true, fullName: true, email: true } },
          },
        },
      },
    });

    if (!issue) {
      res.status(404).json({ data: null, error: "Issue not found" });
      return;
    }

    const data = {
      ...issue,
      age: Math.ceil(
        (new Date().getTime() - new Date(issue.createdAt).getTime()) /
          (1000 * 60 * 60 * 24)
      ),
      rag: computeRAG(issue.dueDate, issue.status),
    };

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
