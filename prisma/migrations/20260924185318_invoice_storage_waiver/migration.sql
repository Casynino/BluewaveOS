-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "storageWaivedAt" TIMESTAMP(3),
ADD COLUMN     "storageWaivedReason" TEXT;
