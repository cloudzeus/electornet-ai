-- AlterTable
ALTER TABLE "WishlistList" ALTER COLUMN "key" SET DEFAULT gen_random_uuid()::text;

-- CreateTable
CREATE TABLE "StickerRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stickerId" TEXT NOT NULL,
    "targets" JSONB NOT NULL DEFAULT '[]',
    "minPrice" DOUBLE PRECISION,
    "maxPrice" DOUBLE PRECISION,
    "onlyInStock" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StickerRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StickerRule_active_idx" ON "StickerRule"("active");

-- AddForeignKey
ALTER TABLE "StickerRule" ADD CONSTRAINT "StickerRule_stickerId_fkey" FOREIGN KEY ("stickerId") REFERENCES "Sticker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

