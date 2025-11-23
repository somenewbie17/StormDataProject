-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_recordings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "botId" TEXT NOT NULL,
    "courseCode" TEXT NOT NULL,
    "courseName" TEXT NOT NULL,
    "program" TEXT NOT NULL DEFAULT 'general',
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
INSERT INTO "new_recordings" ("accessLevel", "audioPath", "botId", "courseCode", "courseName", "createdAt", "duration", "id", "metadata", "recordedAt", "status", "transcriptPath", "updatedAt", "videoPath") SELECT "accessLevel", "audioPath", "botId", "courseCode", "courseName", "createdAt", "duration", "id", "metadata", "recordedAt", "status", "transcriptPath", "updatedAt", "videoPath" FROM "recordings";
DROP TABLE "recordings";
ALTER TABLE "new_recordings" RENAME TO "recordings";
CREATE UNIQUE INDEX "recordings_botId_key" ON "recordings"("botId");
CREATE INDEX "recordings_program_idx" ON "recordings"("program");
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "studentId" TEXT,
    "tier" TEXT NOT NULL DEFAULT 'free',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'active',
    "registeredProgram" TEXT,
    "paymentMethod" TEXT,
    "mmgPhone" TEXT,
    "signupWeek" INTEGER,
    "subscriptionAmountGyd" INTEGER,
    "paymentGatewayId" TEXT,
    "subscriptionStartedAt" DATETIME,
    "subscriptionEndsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_users" ("createdAt", "email", "id", "name", "tier", "updatedAt") SELECT "createdAt", "email", "id", "name", "tier", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
