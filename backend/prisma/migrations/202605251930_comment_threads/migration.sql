-- Comments v2: threaded comments, actor sessions, media and reactions

DO $$ BEGIN
    CREATE TYPE "CommentMediaType" AS ENUM ('image', 'gif');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "CommentReactionType" AS ENUM ('like', 'dislike');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Comment"
    ADD COLUMN IF NOT EXISTS "authorName" TEXT,
    ADD COLUMN IF NOT EXISTS "authorEmail" TEXT,
    ADD COLUMN IF NOT EXISTS "actorId" TEXT,
    ADD COLUMN IF NOT EXISTS "content" TEXT,
    ADD COLUMN IF NOT EXISTS "mediaUrl" TEXT,
    ADD COLUMN IF NOT EXISTS "mediaType" "CommentMediaType",
    ADD COLUMN IF NOT EXISTS "depth" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "isEdited" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "parentId" INTEGER;

UPDATE "Comment"
SET
  "authorName" = COALESCE("authorName", "name", 'Гість'),
  "content" = COALESCE("content", "text", ''),
  "actorId" = COALESCE("actorId", CONCAT('legacy_actor_', "id"::text));

ALTER TABLE "Comment"
    ALTER COLUMN "authorName" SET NOT NULL,
    ALTER COLUMN "actorId" SET NOT NULL,
    ALTER COLUMN "content" SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Comment_parentId_fkey'
  ) THEN
    ALTER TABLE "Comment"
      ADD CONSTRAINT "Comment_parentId_fkey"
      FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Comment_parentId_createdAt_idx" ON "Comment"("parentId", "createdAt");
CREATE INDEX IF NOT EXISTS "Comment_actorId_createdAt_idx" ON "Comment"("actorId", "createdAt");
CREATE INDEX IF NOT EXISTS "Comment_isDeleted_createdAt_idx" ON "Comment"("isDeleted", "createdAt");

CREATE TABLE IF NOT EXISTS "CommentReaction" (
  "id" SERIAL PRIMARY KEY,
  "commentId" INTEGER NOT NULL,
  "actorId" TEXT NOT NULL,
  "reaction" "CommentReactionType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommentReaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommentReaction_commentId_actorId_key" ON "CommentReaction"("commentId", "actorId");
CREATE INDEX IF NOT EXISTS "CommentReaction_reaction_createdAt_idx" ON "CommentReaction"("reaction", "createdAt");

CREATE TABLE IF NOT EXISTS "CommentActorSession" (
  "id" SERIAL PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "email" TEXT,
  "verificationCodeHash" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "CommentActorSession_actorId_key" ON "CommentActorSession"("actorId");
CREATE INDEX IF NOT EXISTS "CommentActorSession_expiresAt_idx" ON "CommentActorSession"("expiresAt");

ALTER TABLE "Comment" DROP COLUMN IF EXISTS "name";
ALTER TABLE "Comment" DROP COLUMN IF EXISTS "text";
ALTER TABLE "Comment" DROP COLUMN IF EXISTS "isActive";
