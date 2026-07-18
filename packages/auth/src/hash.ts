// Re-export so auth consumers keep one import path; implementation lives in domain to
// avoid a db -> auth -> db dependency cycle (seed needs hashing).
export { hashPassword, verifyPassword } from "@buildflow/domain/security/password";
