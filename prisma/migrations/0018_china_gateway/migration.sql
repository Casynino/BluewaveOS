-- The China side of the public site: cities, product categories, factories,
-- richer markets, business-visit requests and sourcing requests from the web.

-- CreateEnum
CREATE TYPE "FactoryListing" AS ENUM ('LISTING', 'PARTNER');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('REQUESTED', 'UNDER_REVIEW', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "CompanySetting" ADD COLUMN     "sourcingServices" TEXT[] DEFAULT ARRAY['PRODUCT', 'SUPPLIER', 'FACTORY']::TEXT[],
ADD COLUMN     "visitsEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "MarketInformation" ADD COLUMN     "address" TEXT,
ADD COLUMN     "cityId" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gallery" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "hours" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "tips" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "visitDuration" TEXT;

-- AlterTable
ALTER TABLE "RequestDocument" ADD COLUMN     "sourcingRequestId" TEXT;

-- AlterTable
ALTER TABLE "SourcingRequest" ADD COLUMN     "category" TEXT,
ADD COLUMN     "channel" TEXT NOT NULL DEFAULT 'STAFF',
ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "preferredCity" TEXT,
ADD COLUMN     "publicKey" TEXT,
ADD COLUMN     "service" TEXT,
ADD COLUMN     "specifications" TEXT,
ADD COLUMN     "supplierNeeds" TEXT,
ADD COLUMN     "whatsapp" TEXT;

-- CreateTable
CREATE TABLE "ChinaCity" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameZh" TEXT,
    "province" TEXT,
    "tagline" TEXT,
    "summary" TEXT,
    "body" TEXT,
    "knownFor" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whatToSource" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "businessDistricts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "travelNote" TEXT,
    "heroImage" TEXT,
    "gallery" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "services" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChinaCity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCategory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "image" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factory" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cityId" TEXT,
    "district" TEXT,
    "industry" TEXT,
    "summary" TEXT,
    "body" TEXT,
    "products" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "production" TEXT,
    "moq" TEXT,
    "exportExperience" TEXT,
    "listing" "FactoryListing" NOT NULL DEFAULT 'LISTING',
    "visitsAvailable" BOOLEAN NOT NULL DEFAULT false,
    "heroImage" TEXT,
    "gallery" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imagesIllustrative" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Factory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessVisitRequest" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "customerId" TEXT,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "contactEmail" TEXT,
    "travelFrom" TIMESTAMP(3),
    "travelTo" TIMESTAMP(3),
    "flexibleDates" BOOLEAN NOT NULL DEFAULT false,
    "cities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "markets" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "factories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "travelers" INTEGER NOT NULL DEFAULT 1,
    "language" TEXT,
    "wantsHotelHelp" BOOLEAN NOT NULL DEFAULT false,
    "wantsTransportHelp" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "status" "VisitStatus" NOT NULL DEFAULT 'REQUESTED',
    "assignedToId" TEXT,
    "plan" TEXT,
    "staffNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessVisitRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_MarketCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MarketCategories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_FactoryCategories" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FactoryCategories_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChinaCity_slug_key" ON "ChinaCity"("slug");

-- CreateIndex
CREATE INDEX "ChinaCity_published_sortOrder_idx" ON "ChinaCity"("published", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProductCategory_slug_key" ON "ProductCategory"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Factory_slug_key" ON "Factory"("slug");

-- CreateIndex
CREATE INDEX "Factory_cityId_idx" ON "Factory"("cityId");

-- CreateIndex
CREATE INDEX "Factory_published_sortOrder_idx" ON "Factory"("published", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessVisitRequest_reference_key" ON "BusinessVisitRequest"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessVisitRequest_publicKey_key" ON "BusinessVisitRequest"("publicKey");

-- CreateIndex
CREATE INDEX "BusinessVisitRequest_status_createdAt_idx" ON "BusinessVisitRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BusinessVisitRequest_contactPhone_createdAt_idx" ON "BusinessVisitRequest"("contactPhone", "createdAt");

-- CreateIndex
CREATE INDEX "_MarketCategories_B_index" ON "_MarketCategories"("B");

-- CreateIndex
CREATE INDEX "_FactoryCategories_B_index" ON "_FactoryCategories"("B");

-- CreateIndex
CREATE INDEX "MarketInformation_cityId_idx" ON "MarketInformation"("cityId");

-- CreateIndex
CREATE INDEX "MarketInformation_published_sortOrder_idx" ON "MarketInformation"("published", "sortOrder");

-- CreateIndex
CREATE INDEX "RequestDocument_sourcingRequestId_idx" ON "RequestDocument"("sourcingRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "SourcingRequest_publicKey_key" ON "SourcingRequest"("publicKey");

-- AddForeignKey
ALTER TABLE "RequestDocument" ADD CONSTRAINT "RequestDocument_sourcingRequestId_fkey" FOREIGN KEY ("sourcingRequestId") REFERENCES "SourcingRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketInformation" ADD CONSTRAINT "MarketInformation_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "ChinaCity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factory" ADD CONSTRAINT "Factory_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "ChinaCity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessVisitRequest" ADD CONSTRAINT "BusinessVisitRequest_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessVisitRequest" ADD CONSTRAINT "BusinessVisitRequest_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MarketCategories" ADD CONSTRAINT "_MarketCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "MarketInformation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MarketCategories" ADD CONSTRAINT "_MarketCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FactoryCategories" ADD CONSTRAINT "_FactoryCategories_A_fkey" FOREIGN KEY ("A") REFERENCES "Factory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FactoryCategories" ADD CONSTRAINT "_FactoryCategories_B_fkey" FOREIGN KEY ("B") REFERENCES "ProductCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

