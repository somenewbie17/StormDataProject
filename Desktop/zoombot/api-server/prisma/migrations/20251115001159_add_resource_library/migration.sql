-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "recordings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "recordedAt" DATETIME NOT NULL,
    "duration" INTEGER NOT NULL,
    "videoPath" TEXT NOT NULL,
    "audioPath" TEXT,
    "transcriptPath" TEXT,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "accessLevel" TEXT NOT NULL DEFAULT 'premium',
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "user_recording_access" (
    "userId" TEXT NOT NULL,
    "recordingId" TEXT NOT NULL,
    "grantedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,

    PRIMARY KEY ("userId", "recordingId"),
    CONSTRAINT "user_recording_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_recording_access_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "recordings" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "courses" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "zoomLink" TEXT NOT NULL,
    "semester" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL DEFAULT 'premium',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "folders" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "parentId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "folders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "resources" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "folderId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "courseCode" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAccessedAt" DATETIME,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "previousVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "resources_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "folders" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "resources_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "resources" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tags" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "resource_tags" (
    "resourceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("resourceId", "tagId"),
    CONSTRAINT "resource_tags_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "resource_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "resource_notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resourceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "timestamp" INTEGER,
    "position" TEXT,
    "color" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "resource_notes_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "resource_shares" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resourceId" TEXT NOT NULL,
    "sharedBy" TEXT NOT NULL,
    "sharedWith" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'view',
    "expiresAt" DATETIME,
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "resource_shares_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "resources" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "recordings_botId_key" ON "recordings"("botId");

-- CreateIndex
CREATE INDEX "folders_userId_idx" ON "folders"("userId");

-- CreateIndex
CREATE INDEX "resources_userId_idx" ON "resources"("userId");

-- CreateIndex
CREATE INDEX "resources_courseCode_idx" ON "resources"("courseCode");

-- CreateIndex
CREATE INDEX "resources_folderId_idx" ON "resources"("folderId");

-- CreateIndex
CREATE UNIQUE INDEX "tags_userId_name_key" ON "tags"("userId", "name");

-- CreateIndex
CREATE INDEX "resource_notes_resourceId_idx" ON "resource_notes"("resourceId");

-- CreateIndex
CREATE INDEX "resource_notes_userId_idx" ON "resource_notes"("userId");

-- CreateIndex
CREATE INDEX "resource_shares_resourceId_idx" ON "resource_shares"("resourceId");

-- CreateIndex
CREATE INDEX "resource_shares_sharedWith_idx" ON "resource_shares"("sharedWith");
