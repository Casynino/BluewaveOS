-- AlterTable
ALTER TABLE "ContainerExpense" ADD COLUMN     "executiveId" TEXT;

-- CreateIndex
CREATE INDEX "ContainerExpense_executiveId_createdAt_idx" ON "ContainerExpense"("executiveId", "createdAt");

-- AddForeignKey
ALTER TABLE "ContainerExpense" ADD CONSTRAINT "ContainerExpense_executiveId_fkey" FOREIGN KEY ("executiveId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
