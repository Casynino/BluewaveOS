import type { Prisma } from "@prisma/client";

/**
 * WHAT OF THE DEVELOPER'S THE OWNER SEES: ONLY WHAT CHANGED SOMETHING.
 *
 * By the owner's decision the developer's own comings and goings — signing
 * in and out, opening a page, starting and stopping Work as — are the
 * developer's to read, on the developer's own Audit page. Anyone else reading
 * the audit log sees the developer only where something was added, changed or
 * removed. Nothing is deleted: the lines are all still kept.
 */
export const DEVELOPER_CHANGES_ONLY: Prisma.AuditLogWhereInput = {
  NOT: {
    AND: [
      { actorType: "DEVELOPER" },
      {
        OR: [
          { action: { startsWith: "auth." } },
          { action: { endsWith: ".viewed" } },
          { action: { startsWith: "developer.work_as." } },
        ],
      },
    ],
  },
};
