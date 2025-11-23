-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL DEFAULT 'changeme',
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
INSERT INTO "new_users" ("createdAt", "email", "id", "mmgPhone", "name", "paymentGatewayId", "paymentMethod", "registeredProgram", "signupWeek", "studentId", "subscriptionAmountGyd", "subscriptionEndsAt", "subscriptionStartedAt", "subscriptionStatus", "tier", "updatedAt") SELECT "createdAt", "email", "id", "mmgPhone", "name", "paymentGatewayId", "paymentMethod", "registeredProgram", "signupWeek", "studentId", "subscriptionAmountGyd", "subscriptionEndsAt", "subscriptionStartedAt", "subscriptionStatus", "tier", "updatedAt" FROM "users";
DROP TABLE "users";
ALTER TABLE "new_users" RENAME TO "users";
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
