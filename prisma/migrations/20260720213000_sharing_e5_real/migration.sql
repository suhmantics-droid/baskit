
-- DropIndex
DROP INDEX "Reservation_itemId_reservedById_key";

-- AlterTable
ALTER TABLE "List" ADD COLUMN     "shareToken" TEXT;

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "reserverName" TEXT,
ALTER COLUMN "reservedById" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "List_shareToken_key" ON "List"("shareToken");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_itemId_key" ON "Reservation"("itemId");

