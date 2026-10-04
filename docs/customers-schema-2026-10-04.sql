-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "firstPurchaseAt" TIMESTAMP(3),
ADD COLUMN     "lastPurchaseAt" TIMESTAMP(3),
ADD COLUMN     "nopId" INTEGER,
ADD COLUMN     "phoneKey" TEXT,
ADD COLUMN     "purchaseCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "purchaseTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable
ALTER TABLE "CustomerDevice" ADD COLUMN     "purchaseLineId" TEXT,
ADD COLUMN     "unitNo" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "WishlistList" ALTER COLUMN "key" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT,
    "s1Findoc" INTEGER,
    "s1Series" INTEGER,
    "seriesCode" TEXT,
    "seriesName" TEXT,
    "docNo" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "trdr" INTEGER,
    "total" DECIMAL(12,2),
    "net" DECIMAL(12,2),
    "vat" DECIMAL(12,2),
    "recipient" JSONB,
    "parentId" TEXT,
    "orderId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseLine" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "mtrl" INTEGER,
    "productId" TEXT,
    "code" TEXT,
    "title" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "unitPrice" DECIMAL(12,2),
    "lineTotal" DECIMAL(12,2),
    "memberTrdr" INTEGER,

    CONSTRAINT "PurchaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_s1Findoc_key" ON "Purchase"("s1Findoc");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_orderId_key" ON "Purchase"("orderId");

-- CreateIndex
CREATE INDEX "Purchase_customerId_date_idx" ON "Purchase"("customerId", "date");

-- CreateIndex
CREATE INDEX "Purchase_trdr_idx" ON "Purchase"("trdr");

-- CreateIndex
CREATE INDEX "Purchase_kind_date_idx" ON "Purchase"("kind", "date");

-- CreateIndex
CREATE INDEX "Purchase_parentId_idx" ON "Purchase"("parentId");

-- CreateIndex
CREATE INDEX "PurchaseLine_productId_idx" ON "PurchaseLine"("productId");

-- CreateIndex
CREATE INDEX "PurchaseLine_mtrl_idx" ON "PurchaseLine"("mtrl");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseLine_purchaseId_lineNo_key" ON "PurchaseLine"("purchaseId", "lineNo");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_nopId_key" ON "Customer"("nopId");

-- CreateIndex
CREATE INDEX "Customer_phoneKey_idx" ON "Customer"("phoneKey");

-- CreateIndex
CREATE INDEX "Customer_lastPurchaseAt_idx" ON "Customer"("lastPurchaseAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDevice_purchaseLineId_unitNo_key" ON "CustomerDevice"("purchaseLineId", "unitNo");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

