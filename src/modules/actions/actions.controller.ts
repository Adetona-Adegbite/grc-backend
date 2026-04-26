import { Response } from "express";
import { Request } from "express";
import { prisma } from "../../config/prisma";
import { logAudit } from "../../utils/auditLog";

const generateActionId = async (companyId: string): Promise<string> => {
  const count = await prisma.action.count({ where: { companyId } });
  return `ACT-${String(count + 1).padStart(3, "0")}`;
};

export const getActions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { issue_id } = req.query as { issue_id?: string };

    const actions = await prisma.action.findMany({
      where: {
        companyId,
        ...(issue_id && { issueId: issue_id }),
      },
      include: {
        owner: { select: { id: true, fullName: true, email: true } },
        issue: { select: { issueId: true, description: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const data = actions.map((action: any) => ({
      ...action,
      rag: (() => {
        if (action.status === "completed") return "green";
        if (!action.dueDate) return "grey";
        const diffDays = Math.ceil(
          (new Date(action.dueDate).getTime() - new Date().getTime()) /
            (1000 * 60 * 60 * 24)
        );
        if (diffDays < 0) return "red";
        if (diffDays <= 7) return "amber";
        return "green";
      })(),
    }));

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const createAction = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { issueId, description, ownerId, dueDate } = req.body as {
      issueId: string;
      description: string;
      ownerId?: string;
      dueDate?: string;
    };

    if (!issueId || !description) {
      res
        .status(400)
        .json({ data: null, error: "issueId and description are required" });
      return;
    }

    const issue = await prisma.issue.findFirst({
      where: { id: issueId, companyId },
    });

    if (!issue) {
      res.status(404).json({ data: null, error: "Issue not found" });
      return;
    }

    const actionId = await generateActionId(companyId);

    const action = await prisma.action.create({
      data: {
        actionId,
        companyId,
        issueId,
        description,
        status: "in_progress",
        progress: 0,
        ...(ownerId !== undefined && { ownerId }),
        ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
      },
    });
    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Action created",
      entityType: "action",
      entityId: action.id,
      detail: `${action.actionId} — ${action.description}`,
    });
    res.status(201).json({ data: action, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const updateAction = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };
    const { description, ownerId, dueDate, progress, status } = req.body as {
      description?: string;
      ownerId?: string;
      dueDate?: string;
      progress?: number;
      status?: string;
    };

    const existing = await prisma.action.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      res.status(404).json({ data: null, error: "Action not found" });
      return;
    }

    if (progress !== undefined && (progress < 0 || progress > 100)) {
      res
        .status(400)
        .json({ data: null, error: "Progress must be between 0 and 100" });
      return;
    }

    const action = await prisma.action.update({
      where: { id },
      data: {
        ...(description !== undefined && { description }),
        ...(ownerId !== undefined && { ownerId }),
        ...(dueDate !== undefined && { dueDate: new Date(dueDate) }),
        ...(progress !== undefined && { progress }),
        ...(status !== undefined && { status: status as any }),
        lastUpdate: new Date(),
      },
    });
    await logAudit({
      companyId,
      userId: req.user!.userId,
      action:
        action.status === "completed" ? "Action closed" : "Action updated",
      entityType: "action",
      entityId: action.id,
      detail: `${action.actionId} — ${
        action.status === "completed"
          ? "Complete"
          : `${action.progress}% progress`
      }`,
    });
    res.status(200).json({ data: action, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const deleteAction = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { id } = req.params as { id: string };

    const existing = await prisma.action.findFirst({
      where: { id, companyId },
    });

    if (!existing) {
      res.status(404).json({ data: null, error: "Action not found" });
      return;
    }

    await prisma.action.delete({ where: { id } });

    res.status(200).json({ data: { message: "Action deleted" }, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
