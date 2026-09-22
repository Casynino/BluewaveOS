"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PackageMinus, PackagePlus } from "lucide-react";

import {
  loadCargo,
  putOnArrivedContainer,
  putOnSailedContainer,
  takeOffArrivedContainer,
  takeOffSailedContainer,
  unloadCargo,
  type ActionState,
} from "@/lib/actions/containers";
import { FormMessage } from "@/components/app/form-message";
import { SubmitButton } from "@/components/app/submit-button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCbm, formatWeight } from "@/lib/format";
import { distinctMark } from "@/lib/customer-name";

import { useT } from "@/components/app/locale-provider";

/**
 * WHERE THE BOX IS, WHICH DECIDES WHICH PAIR OF ACTIONS ANSWERS.
 *
 * Three stretches of a container's life, three pairs, and they are genuinely
 * different jobs rather than one job with a flag: loading picks cargo off the
 * Foshan floor and is nobody's correction; the sailed pair records a
 * consignment inside a box on the water; the landed pair corrects a manifest
 * the Dar floor has read against real cargo and opens a case on what it found.
 * The screen is one screen because the person standing at it has one question —
 * what is in this container — and the stage is the server's business, not
 * theirs.
 */
export type ContainerStage = "open" | "sailed" | "landed";

const PUT: Record<ContainerStage, typeof loadCargo> = {
  open: loadCargo,
  sailed: putOnSailedContainer,
  landed: putOnArrivedContainer,
};
const TAKE_OFF: Record<ContainerStage, typeof unloadCargo> = {
  open: unloadCargo,
  sailed: takeOffSailedContainer,
  landed: takeOffArrivedContainer,
};

/* Loading takes a list of ticked consignments; the two correction actions take
   one consignment and the reason it moved. One field name each, so the form
   below does not have to know which it is talking to. */
const PUT_FIELD: Record<ContainerStage, string> = {
  open: "cargoIds",
  sailed: "cargoId",
  landed: "cargoId",
};

export type CargoLine = {
  cargoId: string;
  reference: string;
  shippingMark: string | null;
  customer: string;
  goods: string;
  packages: number;
  pieces: number | null;
  cbm: string;
  weightKg: string | null;
  /** The consignment's own stage, in English; the dictionary has the rest. */
  status: string;
};

/**
 * A consignment on the floor that could go on this box.
 *
 * The same figures as the manifest beside it, in the same order, so the eye
 * moves between the two lists without re-learning anything — and so the loader
 * can see what a bale would add to the box before pressing anything.
 */
export type Candidate = {
  id: string;
  reference: string;
  shippingMark: string | null;
  customer: string;
  phone: string;
  goods: string;
  packages: number;
  pieces: number | null;
  cbm: string;
  weightKg: string | null;
};

/**
 * WHAT IS IN THIS CONTAINER, AND HOW TO PUT IT RIGHT.
 *
 * The one table a correction is made from, whatever stage the box has reached.
 * Each row carries its own reason box, because the reason belongs to the
 * consignment that moved and not to the afternoon: "wrong box" against one bale
 * and "customer cancelled" against another are two different answers to the
 * same question six months from now.
 */
export function ContainerCargoEditor({
  containerId,
  containerReference,
  stage,
  lines,
  canEdit,
  reasonRequired,
}: {
  containerId: string;
  containerReference: string;
  stage: ContainerStage;
  lines: CargoLine[];
  canEdit: boolean;
  /** An open box takes cargo off without explaining itself; a shut one does not. */
  reasonRequired: boolean;
}) {
  const tx = useT();
  const [state, takeOff] = useActionState<ActionState, FormData>(
    TAKE_OFF[stage],
    {}
  );

  const totalCbm = lines.reduce((sum, l) => sum + Number(l.cbm), 0);
  const totalPackages = lines.reduce((sum, l) => sum + l.packages, 0);
  const totalWeight = lines.reduce((sum, l) => sum + Number(l.weightKg ?? 0), 0);

  if (lines.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {tx("There is nothing on this container.")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tx("Cargo")}</TableHead>
            <TableHead>{tx("Customer")}</TableHead>
            <TableHead>{tx("Goods")}</TableHead>
            <TableHead className="text-right">{tx("Pkgs")}</TableHead>
            <TableHead className="text-right">{tx("Pcs")}</TableHead>
            <TableHead className="text-right">CBM</TableHead>
            <TableHead className="text-right">{tx("Weight")}</TableHead>
            <TableHead>{tx("Status")}</TableHead>
            {canEdit ? (
              <TableHead className="text-right">{tx("Take off")}</TableHead>
            ) : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.cargoId}>
              <TableCell>
                <Link
                  href={`/app/cargo/${line.cargoId}`}
                  className="tnum whitespace-nowrap text-sm font-medium hover:underline"
                >
                  {line.reference}
                </Link>
                {distinctMark(line.customer, line.shippingMark) ? (
                  <span className="tnum block whitespace-nowrap text-xs text-muted-foreground">
                    {distinctMark(line.customer, line.shippingMark)}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="max-w-[9rem] truncate text-sm font-semibold">
                {line.customer}
              </TableCell>
              <TableCell className="max-w-[12rem] truncate text-sm text-muted-foreground">
                {line.goods || "—"}
              </TableCell>
              <TableCell className="tnum text-right text-sm">
                {line.packages}
              </TableCell>
              {/* Nothing tallied is not none tallied. */}
              <TableCell className="tnum text-right text-sm">
                {line.pieces ?? "—"}
              </TableCell>
              <TableCell className="tnum whitespace-nowrap text-right text-sm font-medium">
                {formatCbm(line.cbm)}
              </TableCell>
              <TableCell className="tnum whitespace-nowrap text-right text-sm text-muted-foreground">
                {line.weightKg ? formatWeight(line.weightKg) : "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {tx(line.status)}
              </TableCell>
              {canEdit ? (
                <TableCell className="text-right">
                  {/* One form per row, inside the cell — a form cannot be a
                      child of a table row, and the reason has to travel with
                      the consignment it explains. */}
                  <form
                    action={takeOff}
                    className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end"
                  >
                    <input type="hidden" name="containerId" value={containerId} />
                    <input type="hidden" name="cargoId" value={line.cargoId} />
                    <Input
                      name="reason"
                      required={reasonRequired}
                      className="h-9 w-40 sm:w-44"
                      placeholder={tx("Why it comes off")}
                      aria-label={`${tx("Why it comes off")} — ${line.reference}`}
                    />
                    <SubmitButton
                      size="sm"
                      variant="outline"
                      pendingLabel={tx("Taking off…")}
                    >
                      <PackageMinus />
                      {tx("Take off")}
                    </SubmitButton>
                  </form>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* The count and the volume, under the rows they are summed from.
          Nobody types a total on this screen; every figure here is the cargo
          read back out. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-secondary px-3 py-2 text-sm">
        <span>
          {lines.length}{" "}
          {lines.length === 1 ? tx("consignment") : tx("consignments")} ·{" "}
          {totalPackages} {tx("pkg")}
          {totalWeight > 0 ? ` · ${formatWeight(totalWeight)}` : ""}
        </span>
        <span className="tnum font-semibold">{formatCbm(totalCbm)}</span>
      </div>

      <FormMessage error={state.error} ok={state.ok} />

      {canEdit && stage !== "open" ? (
        <p className="text-xs text-muted-foreground">
          {stage === "sailed"
            ? tx("Taking a consignment off a box that has sailed puts it back on the Foshan floor and redraws the packing list.")
            : tx("Taking a consignment off a landed box puts it back on the Foshan floor and opens a case on where it is.")}
        </p>
      ) : null}
      {canEdit ? null : (
        <p className="text-xs text-muted-foreground">
          {tx("Changing what is on this container is another desk's to do.")}{" "}
          {containerReference}
        </p>
      )}
    </div>
  );
}

/**
 * THE FOSHAN FLOOR, AND ONE PRESS TO PUT A ROW ON THIS BOX.
 *
 * The common case is not a discovery at the port. It is the departure being
 * pressed on Monday before somebody had finished recording Friday's load: the
 * cargo is on the water and the record says it is still on the floor. So the
 * list here is the floor itself — everything Foshan took in that is on no
 * container — with the figures the loader is comparing, and a reason box on
 * each row.
 *
 * Never a new record: what goes on a manifest is a consignment that already
 * exists, with its own reference, its own mark and its own Foshan
 * measurements. Nothing about the cargo is retyped.
 *
 * Searched rather than scrolled, because a floor holding two hundred waiting
 * consignments is a list nobody can find anything in — and the cap is
 * searchable rather than silent.
 */
export function AddCargoToContainer({
  containerId,
  stage,
  candidates,
  total,
  query,
}: {
  containerId: string;
  stage: ContainerStage;
  candidates: Candidate[];
  /** How many match, which is not how many are shown. */
  total: number;
  query: string;
}) {
  const tx = useT();
  const [state, action] = useActionState<ActionState, FormData>(PUT[stage], {});

  return (
    <div className="space-y-3">
      {/* Its own GET form, outside the rows below it — a form cannot be nested
          in a form, and the floor has to stay searchable while a consignment
          is picked. */}
      <form className="flex gap-2">
        <Input
          name="q"
          defaultValue={query}
          placeholder={tx("Name, phone, reference, mark or goods…")}
          aria-label={tx("Search the Foshan floor")}
        />
        <SubmitButton variant="outline">{tx("Find")}</SubmitButton>
      </form>

      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {query
            ? tx("Nothing waiting matches that.")
            : tx("Nothing is waiting that could go on this container.")}
        </p>
      ) : (
        <>
          <div className="max-h-[28rem] overflow-y-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow>
                  <TableHead>{tx("Cargo")}</TableHead>
                  <TableHead>{tx("Customer")}</TableHead>
                  <TableHead>{tx("Goods")}</TableHead>
                  <TableHead className="text-right">{tx("Pkgs")}</TableHead>
                  <TableHead className="text-right">{tx("Pcs")}</TableHead>
                  <TableHead className="text-right">CBM</TableHead>
                  <TableHead className="text-right">{tx("Weight")}</TableHead>
                  <TableHead className="text-right">{tx("Put on")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/app/cargo/${c.id}`}
                        className="tnum whitespace-nowrap text-sm font-medium hover:underline"
                      >
                        {c.reference}
                      </Link>
                      {distinctMark(c.customer, c.shippingMark) ? (
                        <span className="tnum block whitespace-nowrap text-xs text-muted-foreground">
                          {distinctMark(c.customer, c.shippingMark)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[9rem] truncate text-sm font-semibold">
                      {c.customer}
                      {/* The phone is searched on, so it is shown: a clerk who
                          found a row by typing a number needs to see the one
                          that matched. */}
                      <span className="tnum block whitespace-nowrap text-xs font-normal text-muted-foreground">
                        {c.phone}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[12rem] truncate text-sm text-muted-foreground">
                      {c.goods || "—"}
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">
                      {c.packages}
                    </TableCell>
                    <TableCell className="tnum text-right text-sm">
                      {c.pieces ?? "—"}
                    </TableCell>
                    <TableCell className="tnum whitespace-nowrap text-right text-sm font-medium">
                      {formatCbm(c.cbm)}
                    </TableCell>
                    <TableCell className="tnum whitespace-nowrap text-right text-sm text-muted-foreground">
                      {c.weightKg ? formatWeight(c.weightKg) : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {/* One form per row, inside the cell. The reason travels
                          with the consignment it explains, not with the
                          afternoon somebody spent correcting six of them. */}
                      <form
                        action={action}
                        className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end"
                      >
                        <input type="hidden" name="containerId" value={containerId} />
                        <input type="hidden" name={PUT_FIELD[stage]} value={c.id} />
                        <Input
                          name="reason"
                          required={stage !== "open"}
                          className="h-9 w-40 sm:w-44"
                          placeholder={tx("Why it goes on")}
                          aria-label={`${tx("Why it goes on")} — ${c.reference}`}
                        />
                        <SubmitButton size="sm" pendingLabel={tx("Adding…")}>
                          <PackagePlus />
                          {tx("Put on")}
                        </SubmitButton>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* One sentence, one key. A count spliced out of three fragments
              translates into three fragments of Chinese in English order. */}
          {total > candidates.length ? (
            <p className="text-xs text-muted-foreground">
              {tx("Showing the {shown} oldest of {total} waiting. Search for the rest.")
                .replace("{shown}", String(candidates.length))
                .replace("{total}", String(total))}
            </p>
          ) : null}
          <FormMessage error={state.error} ok={state.ok} />
        </>
      )}
    </div>
  );
}
