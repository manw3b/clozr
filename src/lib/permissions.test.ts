/**
 * Tests de la matriz de permisos (E4).
 *
 * Por qué importa: los permisos son nuestro perímetro de seguridad
 * principal. Frontend usa can() para esconder/disable UI; backend usa
 * can() para rechazar requests. Si alguien rompe esta matriz por
 * accidente (typo, dejar un permiso vacío) los miembros pueden hacer
 * cosas que no deberían.
 *
 * Cubrimos:
 *   - Owner puede hacer TODO.
 *   - Viewer NO puede hacer nada destructivo.
 *   - assertCan throwa con mensaje legible.
 *   - Roles inválidos / null devuelven false (no throwan).
 */

import { describe, it, expect } from "vitest";
import { can, assertCan, PERMISSIONS, type UserRole, type Permission } from "./permissions";

describe("permissions matrix", () => {
  const allPermissions = Object.keys(PERMISSIONS) as Permission[];

  it("owner puede hacer todo (sanity check)", () => {
    for (const perm of allPermissions) {
      expect(can("owner", perm)).toBe(true);
    }
  });

  it("viewer NO puede crear ni borrar nada", () => {
    const destructive: Permission[] = [
      "createSale", "deleteSale", "createClient", "deleteClient",
      "createLead", "createCashMovement", "deleteCashMovement",
      "decrementStock", "manageTeam", "manageWorkspaceSettings",
    ];
    for (const perm of destructive) {
      expect(can("viewer", perm)).toBe(false);
    }
  });

  it("vendedor puede vender pero no administrar", () => {
    // Yes
    expect(can("vendedor", "createSale")).toBe(true);
    expect(can("vendedor", "createClient")).toBe(true);
    expect(can("vendedor", "createCashMovement")).toBe(true);
    expect(can("vendedor", "decrementStock")).toBe(true);
    // No
    expect(can("vendedor", "deleteSale")).toBe(false);
    expect(can("vendedor", "deleteClient")).toBe(false);
    expect(can("vendedor", "manageTeam")).toBe(false);
    expect(can("vendedor", "managePaymentMethods")).toBe(false);
    expect(can("vendedor", "viewCost")).toBe(false);
  });

  it("admin puede casi todo salvo manageTeam (que es owner-only)", () => {
    const adminPerms: Permission[] = [
      "viewCost", "editPricing", "deleteSale", "regularizeSale",
      "deleteClient", "managePaymentMethods", "manageBusiness",
      "manageWorkspaceSettings", "manageExchangeRate", "manageAssignedTasks",
    ];
    for (const perm of adminPerms) {
      expect(can("admin", perm)).toBe(true);
    }
    expect(can("admin", "manageTeam")).toBe(false);
  });

  it("manageTeam es owner-only", () => {
    expect(can("owner", "manageTeam")).toBe(true);
    expect(can("admin", "manageTeam")).toBe(false);
    expect(can("vendedor", "manageTeam")).toBe(false);
    expect(can("viewer", "manageTeam")).toBe(false);
  });

  it("null/undefined/string-invalid devuelve false (no throwa)", () => {
    expect(can(null, "createSale")).toBe(false);
    expect(can(undefined, "createSale")).toBe(false);
    expect(can("", "createSale")).toBe(false);
    expect(can("hacker", "createSale")).toBe(false);
    expect(can("superuser", "manageTeam")).toBe(false);
  });

  it("todas las permissions tienen al menos un rol", () => {
    // Defensa contra typo "[]" — un permiso sin roles permite a nadie,
    // probablemente un bug.
    for (const perm of allPermissions) {
      expect(PERMISSIONS[perm].length).toBeGreaterThan(0);
    }
  });

  it("owner está incluido en todas las permissions", () => {
    // Invariante del sistema: el dueño puede hacer todo. Si un permiso
    // omite "owner" es un bug.
    for (const perm of allPermissions) {
      expect(PERMISSIONS[perm]).toContain("owner");
    }
  });
});

describe("assertCan", () => {
  it("no throwa cuando el rol puede", () => {
    expect(() => assertCan("owner", "manageTeam")).not.toThrow();
  });

  it("throwa con mensaje legible cuando no puede", () => {
    expect(() => assertCan("vendedor", "manageTeam")).toThrow(/manageTeam/);
    expect(() => assertCan("vendedor", "manageTeam")).toThrow(/vendedor/);
  });

  it("throwa para roles null", () => {
    expect(() => assertCan(null, "createSale")).toThrow();
  });
});

describe("type coverage", () => {
  // Smoke test que TypeScript no compile si saco un rol.
  it("UserRole tiene exactamente 4 roles", () => {
    const roles: UserRole[] = ["owner", "admin", "vendedor", "viewer"];
    expect(roles).toHaveLength(4);
  });
});
