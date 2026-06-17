-- AlterTable: add isActive column to AdminUser
ALTER TABLE "AdminUser" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- Migrate old role values to new RBAC roles
UPDATE "AdminUser" SET "role" = 'SUPER_ADMIN' WHERE "role" = 'admin';
