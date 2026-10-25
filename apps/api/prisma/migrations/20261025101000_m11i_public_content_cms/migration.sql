CREATE TYPE "PublicContentFormat" AS ENUM ('MARKDOWN', 'RICH_HTML');

CREATE TABLE "public_content_categories" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" UUID,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "public_content_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public_content_assets" (
  "id" UUID NOT NULL,
  "storageKey" VARCHAR(128) NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" VARCHAR(64) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "public_content_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "public_content_categories_name_key" ON "public_content_categories"("name");
CREATE UNIQUE INDEX "public_content_categories_slug_key" ON "public_content_categories"("slug");
CREATE INDEX "public_content_categories_sortOrder_isActive_idx" ON "public_content_categories"("sortOrder", "isActive");
CREATE UNIQUE INDEX "public_content_assets_storageKey_key" ON "public_content_assets"("storageKey");
CREATE INDEX "public_content_assets_createdById_createdAt_idx" ON "public_content_assets"("createdById", "createdAt");
CREATE INDEX "public_content_assets_deletedAt_idx" ON "public_content_assets"("deletedAt");

ALTER TABLE "public_content"
  ADD COLUMN "categoryId" UUID,
  ADD COLUMN "bodyHtml" TEXT,
  ADD COLUMN "contentFormat" "PublicContentFormat" NOT NULL DEFAULT 'MARKDOWN',
  ADD COLUMN "coverAssetId" UUID;

INSERT INTO "public_content_categories" ("id", "name", "slug", "sortOrder", "updatedAt")
SELECT gen_random_uuid(), category, 'legacy-' || substr(md5(category), 1, 12),
       row_number() OVER (ORDER BY category) - 1, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT category FROM "public_content") existing;

UPDATE "public_content" content
SET "categoryId" = category_row.id
FROM "public_content_categories" category_row
WHERE category_row.name = content.category;

ALTER TABLE "public_content" ALTER COLUMN "categoryId" SET NOT NULL;
ALTER TABLE "public_content" ALTER COLUMN "bodyMarkdown" DROP NOT NULL;
DROP INDEX IF EXISTS "public_content_category_idx";
ALTER TABLE "public_content" DROP COLUMN "category";

CREATE INDEX "public_content_categoryId_idx" ON "public_content"("categoryId");
CREATE INDEX "public_content_coverAssetId_idx" ON "public_content"("coverAssetId");

ALTER TABLE "public_content_categories" ADD CONSTRAINT "public_content_categories_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_content_categories" ADD CONSTRAINT "public_content_categories_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_content_assets" ADD CONSTRAINT "public_content_assets_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_content" ADD CONSTRAINT "public_content_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "public_content_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public_content" ADD CONSTRAINT "public_content_coverAssetId_fkey"
  FOREIGN KEY ("coverAssetId") REFERENCES "public_content_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
