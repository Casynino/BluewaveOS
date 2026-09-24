import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { CargoStatus, Role } from "@prisma/client";

import { canDeleteCargo } from "@/lib/rbac";

/**
 * WHO MAY REMOVE A CONSIGNMENT, ON WHICH SIDE OF THE WATER.
 *
 * The owner's rule, written down: Foshan removes what is still in China;
 * Dar, Finance, the manager and the owner remove what has landed; Support
 * removes nothing, anywhere. The permission is only half the answer — what
 * may be deleted at all is `deleteCargo`'s, and lives in the database tests.
 */
const CHINA_SIDE: CargoStatus[] = ["REGISTERED", "RECEIVED_CHINA", "CONTAINER_LOADED", "DEPARTED_CHINA", "IN_TRANSIT"];
/* Arrival puts the boxes in Tanzania, which is what decides this — not the
   custody rule, which leaves the measurement with Foshan until check-in. */
const DAR_SIDE: CargoStatus[] = ["ARRIVED_TANZANIA", "RECEIVED_DAR", "READY_FOR_RELEASE", "MISSING_AT_DAR"];

const may = (role: Role, statuses: CargoStatus[]) =>
  statuses.every((s) => canDeleteCargo(role, s));
const mayNot = (role: Role, statuses: CargoStatus[]) =>
  statuses.every((s) => !canDeleteCargo(role, s));

describe("deleting a consignment belongs to the floor holding it", () => {
  test("Foshan removes what is still China's, and nothing that has landed", () => {
    assert.ok(may("CHINA_WAREHOUSE", CHINA_SIDE));
    assert.ok(mayNot("CHINA_WAREHOUSE", DAR_SIDE));
  });

  test("Dar removes what has landed, and nothing still on the Foshan shelf", () => {
    assert.ok(may("DAR_WAREHOUSE", DAR_SIDE));
    assert.ok(mayNot("DAR_WAREHOUSE", CHINA_SIDE));
  });

  test("Finance removes a landed consignment — the desk that finds it entered twice", () => {
    assert.ok(may("FINANCE", DAR_SIDE));
    assert.ok(mayNot("FINANCE", CHINA_SIDE));
  });

  test("the manager and the owner remove either side", () => {
    for (const role of ["MANAGER", "ADMIN"] as Role[]) {
      assert.ok(may(role, CHINA_SIDE), `${role} in China`);
      assert.ok(may(role, DAR_SIDE), `${role} in Dar`);
    }
  });

  test("Support removes nothing, anywhere", () => {
    assert.ok(mayNot("CUSTOMER_SUPPORT", CHINA_SIDE));
    assert.ok(mayNot("CUSTOMER_SUPPORT", DAR_SIDE));
  });

  test("a customer holds no staff verb at all", () => {
    assert.ok(mayNot("CUSTOMER", [...CHINA_SIDE, ...DAR_SIDE]));
  });
});
