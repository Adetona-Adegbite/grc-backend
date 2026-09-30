import { Request } from "express";
import { prisma } from "../config/prisma";

// Each country in a company is run independently. A non-admin assigned to
// specific countries sees only those countries' data and people. Admins see
// everything. A non-admin with no assignment can still browse every country
// (members predate country assignment), but belongs to none: they can't be
// given work in a country and restricted colleagues don't see them.

// null means "every country".
export const getAccessibleCountryIds = async (
  userId: string,
  companyId: string,
  role: string,
): Promise<string[] | null> => {
  if (role === "admin") return null;
  const rows = await prisma.memberCountry.findMany({
    where: { userId, companyId },
    select: { countryId: true },
  });
  return rows.length ? rows.map((r) => r.countryId) : null;
};

// Drop-in replacement for the `country_id` query filter used across the API:
// honours an explicit country, but never lets a restricted user reach outside
// the countries they are assigned to.
export const countryScopeWhere = async (
  req: Request,
  countryId?: string,
): Promise<{ countryId?: string | { in: string[] } }> => {
  const allowed = await getAccessibleCountryIds(
    req.user!.userId,
    req.user!.companyId,
    req.user!.role,
  );
  if (countryId && countryId !== "all") {
    if (allowed && !allowed.includes(countryId)) return { countryId: { in: [] } };
    return { countryId };
  }
  return allowed ? { countryId: { in: allowed } } : {};
};

// Country assignments for a set of members, keyed by user id. A member missing
// from the map (or mapped to []) works in every country.
export const memberCountryMap = async (
  companyId: string,
): Promise<Map<string, string[]>> => {
  const rows = await prisma.memberCountry.findMany({
    where: { companyId },
    select: { userId: true, countryId: true },
  });
  const map = new Map<string, string[]>();
  for (const r of rows) {
    map.set(r.userId, [...(map.get(r.userId) ?? []), r.countryId]);
  }
  return map;
};

// Whether a member works in a country: admins everywhere, everyone else only
// in the countries they are assigned to.
export const worksIn = (
  role: string,
  countryIds: string[] | undefined,
  countryId: string,
) => role === "admin" || !!countryIds?.includes(countryId);

// Whether a member's countries overlap the viewer's. Used to hide people in
// other countries (or in no country yet) from a restricted viewer.
export const sharesCountry = (
  role: string,
  countryIds: string[] | undefined,
  viewerAllowed: string[] | null,
) =>
  viewerAllowed === null ||
  role === "admin" ||
  !!countryIds?.some((id) => viewerAllowed.includes(id));

// Whether the signed-in user may work with records in a country.
export const canAccessCountry = async (req: Request, countryId: string) => {
  const allowed = await getAccessibleCountryIds(
    req.user!.userId,
    req.user!.companyId,
    req.user!.role,
  );
  return allowed === null || allowed.includes(countryId);
};

// Validates that a user may be assigned work (owner, tester, recipient) in a
// country. Returns an error message, or null when the assignment is fine.
export const checkAssignableIn = async (
  companyId: string,
  userId: string | null | undefined,
  countryId: string,
  label: string,
): Promise<string | null> => {
  if (!userId) return null;
  const membership = await prisma.userCompany.findFirst({
    where: { userId, companyId },
    select: { role: true },
  });
  if (!membership) return `${label} is not a member of this company`;
  const rows = await prisma.memberCountry.findMany({
    where: { userId, companyId },
    select: { countryId: true },
  });
  const ids = rows.map((r) => r.countryId);
  if (!worksIn(membership.role, ids, countryId)) {
    return ids.length
      ? `${label} is not assigned to this control's country`
      : `${label} isn't assigned to any country yet. Assign them under Settings → Team Members first`;
  }
  return null;
};
