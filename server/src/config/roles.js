// The 4 fixed roles. One installation serves one restaurant, with its own database.
// There is no global super-admin — OWNER is the highest role within an installation.
export const ROLES = Object.freeze({
  CUSTOMER: "customer",
  MANAGER: "manager",
  COORDINATOR: "coordinator",
  OWNER: "owner",
});

export const ALL_ROLES = Object.values(ROLES);
