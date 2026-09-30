import { Response } from "express";
import { Request } from "express";
import { prisma } from "../../config/prisma";
import { logAudit } from "../../utils/auditLog";
import {
  getAccessibleCountryIds,
  memberCountryMap,
  sharesCountry,
  worksIn,
} from "../../utils/countryAccess";

export const getCompanyMembers = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const q = req.query.q as string | undefined;
    const countryId = req.query.country_id as string | undefined;

    const [members, countryMap, viewerAllowed] = await Promise.all([
      prisma.userCompany.findMany({
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
      }),
      memberCountryMap(companyId),
      getAccessibleCountryIds(req.user!.userId, companyId, req.user!.role),
    ]);

    // Countries are independent: a restricted viewer only sees people who
    // share a country with them, and `country_id` narrows to one country.
    const data = members
      .map((m: any) => ({
        id: m.user.id,
        fullName: m.user.fullName,
        email: m.user.email,
        role: m.role,
        // Empty means the member works in every country.
        countryIds: countryMap.get(m.user.id) ?? [],
      }))
      .filter((m) => sharesCountry(m.role, m.countryIds, viewerAllowed))
      .filter(
        (m) =>
          !countryId ||
          countryId === "all" ||
          worksIn(m.role, m.countryIds, countryId),
      );

    res.status(200).json({ data, error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

// ─── Business profile ───────────────────────────────────────────

const PROFILE_SELECT = {
  id: true,
  name: true,
  financialYearStart: true,
  registrationNumber: true,
  address: true,
  country: true,
  currency: true,
  logoUrl: true,
  brandColor: true,
  subscriptionStatus: true,
  subscriptionPlan: true,
  billingCycle: true,
  subscriptionActivatedAt: true,
} as const;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

// The profile is complete once the fields the onboarding form marks as
// required are filled in, logo included.
const shapeProfile = (company: any) => ({
  ...company,
  profileComplete: Boolean(
    company.name?.trim() && company.currency?.trim() && company.logoUrl,
  ),
});

// Every member reads the profile: it carries the logo and brand colour the app
// themes itself with, and the subscription status that gates access.
export const getCompanyProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.user!.companyId },
      select: PROFILE_SELECT,
    });
    if (!company) {
      res.status(404).json({ data: null, error: "Company not found" });
      return;
    }
    res.status(200).json({ data: shapeProfile(company), error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

export const updateCompanyProfile = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const {
      name,
      registrationNumber,
      address,
      country,
      currency,
      logoUrl,
      brandColor,
    } = req.body as Record<string, string | null | undefined>;

    if (name !== undefined && !String(name ?? "").trim()) {
      res.status(400).json({ data: null, error: "Business name is required" });
      return;
    }
    if (currency !== undefined && !String(currency ?? "").trim()) {
      res.status(400).json({ data: null, error: "Currency is required" });
      return;
    }
    if (brandColor && !HEX_RE.test(brandColor)) {
      res
        .status(400)
        .json({ data: null, error: "brandColor must be a hex colour like #1a2b3c" });
      return;
    }
    // Logos are only ever files we stored ourselves.
    if (logoUrl && !logoUrl.startsWith("/uploads/logos/")) {
      res.status(400).json({ data: null, error: "Invalid logo" });
      return;
    }

    const trimOrNull = (v: string | null | undefined): string | null =>
      v?.trim() || null;

    const company = await prisma.company.update({
      where: { id: companyId },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(registrationNumber !== undefined && {
          registrationNumber: trimOrNull(registrationNumber),
        }),
        ...(address !== undefined && { address: trimOrNull(address) }),
        ...(country !== undefined && { country: trimOrNull(country) }),
        ...(currency !== undefined && {
          currency: String(currency).trim().toUpperCase(),
        }),
        ...(logoUrl !== undefined && { logoUrl: logoUrl || null }),
        ...(brandColor !== undefined && {
          brandColor: brandColor ? brandColor.toLowerCase() : null,
        }),
      },
      select: PROFILE_SELECT,
    });

    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Business profile updated",
      entityType: "company",
      entityId: companyId,
      detail: company.name,
    });

    res.status(200).json({ data: shapeProfile(company), error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

// ─── Subscription ───────────────────────────────────────────

const PLANS = ["starter", "growth"];
const CYCLES = ["monthly", "yearly"];

// Records the plan the admin picked. It stays "pending" until payment is
// confirmed; no payment provider is wired in yet, so confirmation happens
// through activateSubscription below.
export const chooseSubscriptionPlan = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const companyId = req.user!.companyId;
    const { plan, billingCycle } = req.body as {
      plan?: string;
      billingCycle?: string;
    };

    if (!plan || !PLANS.includes(plan)) {
      res.status(400).json({ data: null, error: "Choose a valid plan" });
      return;
    }
    if (!billingCycle || !CYCLES.includes(billingCycle)) {
      res
        .status(400)
        .json({ data: null, error: "billingCycle must be monthly or yearly" });
      return;
    }

    const existing = await prisma.company.findUnique({
      where: { id: companyId },
      select: { subscriptionStatus: true },
    });

    const company = await prisma.company.update({
      where: { id: companyId },
      data: {
        subscriptionPlan: plan,
        billingCycle,
        // Changing plan never locks out a company that has already paid.
        ...(existing?.subscriptionStatus !== "active" && {
          subscriptionStatus: "pending" as const,
        }),
      },
      select: PROFILE_SELECT,
    });

    await logAudit({
      companyId,
      userId: req.user!.userId,
      action: "Subscription plan chosen",
      entityType: "company",
      entityId: companyId,
      detail: `${plan} (${billingCycle})`,
    });

    res.status(200).json({ data: shapeProfile(company), error: null });
  } catch (error) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};

// Marks a company as paid. This is for the platform operator (Black Marlin),
// not company users, so it is guarded by PLATFORM_ADMIN_KEY rather than a
// login. Replace with a payment-provider webhook once one is chosen.
export const activateSubscription = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const key = process.env.PLATFORM_ADMIN_KEY;
    if (!key) {
      res
        .status(503)
        .json({ data: null, error: "Subscription activation is not configured" });
      return;
    }
    if (req.header("x-platform-key") !== key) {
      res.status(403).json({ data: null, error: "Access denied" });
      return;
    }

    const { companyId, status } = req.body as {
      companyId?: string;
      status?: "active" | "unpaid";
    };
    if (!companyId) {
      res.status(400).json({ data: null, error: "companyId is required" });
      return;
    }
    const next = status === "unpaid" ? "unpaid" : "active";

    const company = await prisma.company.update({
      where: { id: companyId },
      data: {
        subscriptionStatus: next,
        subscriptionActivatedAt: next === "active" ? new Date() : null,
      },
      select: PROFILE_SELECT,
    });

    res.status(200).json({ data: shapeProfile(company), error: null });
  } catch (error: any) {
    if (error?.code === "P2025") {
      res.status(404).json({ data: null, error: "Company not found" });
      return;
    }
    res.status(500).json({ data: null, error: "Internal server error" });
  }
};
