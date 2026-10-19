ALTER TABLE "lessons"
ADD COLUMN "learningObjectives" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "contentMarkdown" TEXT,
ADD COLUMN "estimatedMinutes" INTEGER,
ADD COLUMN "focusTaskCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
