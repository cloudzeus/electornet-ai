-- AlterTable
ALTER TABLE "Promotion" ADD COLUMN     "stickerKey" TEXT;

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "stickerKey" TEXT;

-- AlterTable
ALTER TABLE "WishlistList" ALTER COLUMN "key" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "ProductSticker" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "stickerId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSticker_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSticker_productId_idx" ON "ProductSticker"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSticker_productId_stickerId_key" ON "ProductSticker"("productId", "stickerId");

-- AddForeignKey
ALTER TABLE "ProductSticker" ADD CONSTRAINT "ProductSticker_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSticker" ADD CONSTRAINT "ProductSticker_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "Sticker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

