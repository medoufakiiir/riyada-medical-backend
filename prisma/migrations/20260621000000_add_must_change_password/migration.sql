-- AlterTable: add mustChangePassword column, default true for all existing users
ALTER TABLE "AdminUser" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT true;
