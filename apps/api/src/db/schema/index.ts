// Schema barrel file — each module adds its tables here
// This is the single import point for all Drizzle schema definitions

// NOTE: Using .ts extension for drizzle-kit compatibility (it uses CJS loader)
// Runtime TypeScript resolves .js extension correctly via moduleResolution
export * from "./auth";
export * from "./messenger";
export * from "./calendar";
export * from "./docs";
export * from "./notifications";
export * from "./wiki";
export * from "./base";
export * from "./tasks";
export * from "./approvals";
export * from "./okrs";
export * from "./attendance";
export * from "./email";
export * from "./translation";
export * from "./meetings";
export * from "./forms";
export * from "./sso";
export * from "./files";
