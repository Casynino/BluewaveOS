import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, MessageCircle, Phone, User } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { VisitWorkflow } from "@/components/app/visit-desk";
import { VISIT_STATUS_TONE, visitDates } from "@/components/app/visit-desk-shared";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { VISIT_STATUS_LABEL } from "@/lib/china-content";
import { formatDateTime, formatRelative } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { localeOf } from "@/lib/viewer-locale";

import { primeLocale } from "@/lib/server-t";
export const metadata: Metadata = { title: "Business visit" };

const FIELD_LABEL: Record<string, string> = {
  status: "Status",
  assignedToId: "Handled by",
  plan: "Plan",
  staffNote: "Staff note",
};

/**
 * ONE VISIT REQUEST, EVERYTHING THE VISITOR SENT.
 *
 * The desk reads it all — contact, dates, where they want to go, the help they
 * asked for — and moves it along. The plan written here is printed on the
 * visitor's status page once confirmed; the staff note never is.
 */
export default async function VisitRequestPage({ params }: { params: Promise<{ id: string }> }) {
  await primeLocale();
  const user = await requirePermission("request.view");
  const { id } = await params;

  const visit = await prisma.businessVisitRequest.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, code: true, fullName: true, phone: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });
  if (!visit) notFound();

  const [locale, history, staffRows] = await Promise.all([
    localeOf(user.id),
    prisma.fieldChange.findMany({
      where: { entity: "BusinessVisitRequest", entityId: visit.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { actor: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { active: true, status: "ACTIVE", role: { not: "CUSTOMER" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);
  const tr = (text: string) => t(locale, text);

  const mayManage = can(user.role, "request.manage");
  const mayAssign = can(user.role, "conversation.assign");
  const eligible = staffRows.filter((person) => can(person.role, "request.view"));
  /* Somebody who may not hand work to others is offered themselves and whoever
     holds it now; the action refuses anything else anyway. */
  const staff = eligible
    .filter((person) => mayAssign || person.id === user.id || person.id === visit.assignedToId)
    .map(({ id, name }) => ({ id, name }));
  if (visit.assignedTo && !staff.some((p) => p.id === visit.assignedTo!.id)) {
    staff.push({ id: visit.assignedTo.id, name: visit.assignedTo.name });
  }

  /* History keeps assignee ids; the reader wants names. */
  const assigneeIds = [
    ...new Set(
      history
        .filter((c) => c.field === "assignedToId")
        .flatMap((c) => [c.oldValue, c.newValue])
        .filter((v): v is string => Boolean(v))
    ),
  ];
  const names = new Map(
    assigneeIds.length
      ? (await prisma.user.findMany({ where: { id: { in: assigneeIds } }, select: { id: true, name: true } })).map(
          (u) => [u.id, u.name] as const
        )
      : []
  );
  const shown = (field: string, value: string | null) => {
    if (field === "assignedToId") return value ? (names.get(value) ?? tr("someone no longer listed")) : tr("unassigned");
    if (field === "status") return value ? tr(VISIT_STATUS_LABEL[value as keyof typeof VISIT_STATUS_LABEL] ?? value) : "—";
    return null;
  };

  const help = [visit.wantsHotelHelp ? tr("Hotel") : null, visit.wantsTransportHelp ? tr("Local transport") : null].filter(Boolean);

  const lists: [string, string[]][] = [
    ["Cities", visit.cities],
    ["Markets", visit.markets],
    ["Factories", visit.factories],
    ["Products", visit.categories],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={visit.contactName}
        description={`${visit.reference} · ${tr("received")} ${formatDateTime(visit.createdAt)}`}
        back={{ href: "/app/support/visits", label: "Business visits" }}
        actions={<Badge tone={VISIT_STATUS_TONE[visit.status]}>{tr(VISIT_STATUS_LABEL[visit.status])}</Badge>}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {tr("The trip they asked for")}
            </h2>
            <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <dt className="text-xs text-muted-foreground">{tr("Travel dates")}</dt>
                <dd className="mt-0.5 text-sm font-medium">{visitDates(visit, tr)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{tr("Travellers")}</dt>
                <dd className="tnum mt-0.5 text-sm font-medium">{visit.travelers}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{tr("Language support")}</dt>
                <dd className="mt-0.5 text-sm font-medium">{visit.language ? tr(visit.language) : tr("Not given")}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{tr("Help asked for")}</dt>
                <dd className="mt-0.5 text-sm font-medium">{help.length ? help.join(", ") : tr("None")}</dd>
              </div>
            </dl>

            <dl className="mt-5 space-y-4 border-t pt-4">
              {lists.map(([label, items]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{tr(label)}</dt>
                  <dd className="mt-1.5">
                    {items.length ? (
                      <ul className="flex flex-wrap gap-1.5">
                        {items.map((item) => (
                          <li key={item} className="rounded-md border bg-secondary/50 px-2 py-0.5 text-sm">
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-sm text-muted-foreground">{tr("None picked")}</span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>

            {help.length ? (
              <p className="mt-4 rounded-md bg-warning/10 px-3 py-2 text-xs text-foreground">
                {tr("They asked for help with a hotel or transport. Tell them what can be arranged — the website promised nothing.")}
              </p>
            ) : null}
          </Card>

          <Card className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {tr("Their notes")}
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm">{visit.notes ?? tr("No notes.")}</p>
          </Card>

          {visit.plan ? (
            <Card className="border-success/30 bg-success/5 p-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-success">
                {tr("Plan — the visitor reads this")}
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{visit.plan}</p>
            </Card>
          ) : null}

          {visit.staffNote ? (
            <Card className="p-5">
              <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {tr("Staff note — internal")}
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{visit.staffNote}</p>
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{tr("History")}</h2>
            {history.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">{tr("Nothing has changed since it was received.")}</p>
            ) : (
              <ul className="mt-3 divide-y">
                {history.map((change) => {
                  const before = shown(change.field, change.oldValue);
                  const after = shown(change.field, change.newValue);
                  return (
                    <li key={change.id} className="py-2.5 text-sm">
                      <p>
                        <span className="font-medium">{tr(FIELD_LABEL[change.field] ?? change.field)}</span>
                        {after !== null ? (
                          <span className="text-muted-foreground">
                            {" "}
                            {before} → {after}
                          </span>
                        ) : (
                          <span className="text-muted-foreground"> {tr("updated")}</span>
                        )}
                      </p>
                      <p className="tnum mt-0.5 text-xs text-muted-foreground">
                        {change.actor?.name ?? tr("System")} · {formatRelative(change.createdAt)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="mb-3 font-semibold">{tr("Contact")}</h2>
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p className="font-medium">{visit.contactName}</p>
              <p className="flex items-center gap-2">
                <Phone className="size-3.5 text-muted-foreground" />
                <a href={`tel:${visit.contactPhone}`} className="tnum hover:underline">
                  {visit.contactPhone}
                </a>
              </p>
              {visit.whatsapp ? (
                <p className="flex items-center gap-2">
                  <MessageCircle className="size-3.5 text-muted-foreground" />
                  <span className="tnum">{visit.whatsapp}</span>
                  <span className="text-xs text-muted-foreground">WhatsApp</span>
                </p>
              ) : null}
              {visit.contactEmail ? (
                <p className="flex items-center gap-2">
                  <Mail className="size-3.5 text-muted-foreground" />
                  <a href={`mailto:${visit.contactEmail}`} className="break-all hover:underline">
                    {visit.contactEmail}
                  </a>
                </p>
              ) : null}
            </div>
            {visit.customer ? (
              <Link
                href={`/app/customers/${visit.customer.id}`}
                className="mt-3 flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-secondary/60"
              >
                <User className="mt-0.5 size-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{visit.customer.fullName}</p>
                  <p className="tnum text-xs text-muted-foreground">
                    {visit.customer.code} · {visit.customer.phone}
                  </p>
                </div>
              </Link>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                {tr("Sent without signing in — not linked to a customer account.")}
              </p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 font-semibold">{tr("Move it forward")}</h2>
            {mayManage ? (
              <VisitWorkflow
                locale={locale}
                staff={staff}
                visit={{
                  id: visit.id,
                  status: visit.status,
                  assignedToId: visit.assignedToId,
                  plan: visit.plan,
                  staffNote: visit.staffNote,
                }}
              />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{tr("You can read this request but not work it.")}</p>
                <p className="mt-2 text-sm">
                  {tr("Handled by")}: {visit.assignedTo?.name ?? tr("Unassigned")}
                </p>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
