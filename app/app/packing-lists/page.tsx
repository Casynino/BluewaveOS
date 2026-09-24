import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { ListCap } from "@/components/app/list-cap";
import { PageHeader } from "@/components/app/page-header";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

import { primeLocale, T } from "@/lib/server-t";
export const metadata: Metadata = { title: "Packing lists" };

/** How many lists one look at this register draws. */
const PAGE = 100;

export default async function PackingListsPage() {
  await primeLocale();
  await requirePermission("packingList.view");

  const [lists, issued] = await Promise.all([
    prisma.packingList.findMany({
      orderBy: { issuedAt: "desc" },
      take: PAGE,
      include: {
        container: {
          select: { id: true, reference: true, containerNumber: true, sealNumber: true },
        },
        issuedBy: { select: { name: true } },
      },
    }),
    prisma.packingList.count(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={T("Packing lists")}
        description={T("One per container, frozen at the moment it was issued.")}
      />
      <Card>
        {lists.length === 0 ? (
          <EmptyState
            icon="ClipboardList"
            title={T("Nothing issued yet")}
            description={T("A packing list is issued from the container it describes.")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{T("Number")}</TableHead>
                <TableHead>{T("Container")}</TableHead>
                <TableHead className="hidden md:table-cell">{T("Seal")}</TableHead>
                <TableHead className="hidden lg:table-cell">{T("Issued by")}</TableHead>
                <TableHead>{T("Issued")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lists.map((list) => (
                <TableRow key={list.id}>
                  <TableCell>
                    <Link
                      href={`/app/containers/${list.container.id}/packing-list`}
                      className="tnum font-medium hover:underline"
                    >
                      {list.number}
                    </Link>
                  </TableCell>
                  <TableCell className="tnum text-sm">
                    {list.container.reference}
                  </TableCell>
                  <TableCell className="tnum hidden text-sm text-muted-foreground md:table-cell">
                    {list.container.sealNumber ?? "—"}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {list.issuedBy?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatDate(list.issuedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>
      <ListCap shown={lists.length} total={issued} />
    </div>
  );
}
