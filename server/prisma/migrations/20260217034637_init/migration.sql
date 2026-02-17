-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" BIGINT,
    "lastSeen" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playerLevel" INTEGER,
    "playerCurXp" INTEGER,
    "vacBanned" BOOLEAN NOT NULL DEFAULT false,
    "penaltySeconds" INTEGER,
    "penaltyReason" INTEGER,
    "discoveredFromId" TEXT,
    "totalMatches" INTEGER NOT NULL DEFAULT 0,
    "totalKills" INTEGER NOT NULL DEFAULT 0,
    "totalDeaths" INTEGER NOT NULL DEFAULT 0,
    "totalAssists" INTEGER NOT NULL DEFAULT 0,
    "totalMvps" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Player_discoveredFromId_fkey" FOREIGN KEY ("discoveredFromId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchTime" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "map" TEXT,
    "duration" INTEGER,
    "maxRounds" INTEGER,
    "serverIp" BIGINT,
    "tvPort" INTEGER,
    "gameType" INTEGER,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "roundStatsRaw" TEXT
);

-- CreateTable
CREATE TABLE "MatchPlayer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "slot" INTEGER,
    "team" INTEGER,
    "kills" INTEGER NOT NULL DEFAULT 0,
    "deaths" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "mvps" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "MatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchPlayer_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "map" TEXT,
    "roundResult" INTEGER,
    "matchResult" INTEGER,
    "teamScores" TEXT,
    "kills" TEXT,
    "deaths" TEXT,
    "assists" TEXT,
    "scores" TEXT,
    "mvps" TEXT,
    CONSTRAINT "Round_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrawlQueue" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "playerId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttempt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT
);

-- CreateTable
CREATE TABLE "CrawlStats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "timestamp" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalPlayers" INTEGER NOT NULL,
    "totalMatches" INTEGER NOT NULL,
    "pendingCrawls" INTEGER NOT NULL,
    "failedCrawls" INTEGER NOT NULL,
    "avgMatchesPerPlayer" REAL NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_accountId_key" ON "Player"("accountId");

-- CreateIndex
CREATE INDEX "Player_lastSeen_idx" ON "Player"("lastSeen");

-- CreateIndex
CREATE INDEX "Player_discoveredFromId_idx" ON "Player"("discoveredFromId");

-- CreateIndex
CREATE INDEX "Match_matchTime_idx" ON "Match"("matchTime");

-- CreateIndex
CREATE INDEX "Match_processed_idx" ON "Match"("processed");

-- CreateIndex
CREATE INDEX "Match_map_idx" ON "Match"("map");

-- CreateIndex
CREATE INDEX "MatchPlayer_playerId_idx" ON "MatchPlayer"("playerId");

-- CreateIndex
CREATE INDEX "MatchPlayer_matchId_idx" ON "MatchPlayer"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayer_matchId_playerId_key" ON "MatchPlayer"("matchId", "playerId");

-- CreateIndex
CREATE INDEX "Round_matchId_idx" ON "Round"("matchId");

-- CreateIndex
CREATE UNIQUE INDEX "Round_matchId_roundNumber_key" ON "Round"("matchId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CrawlQueue_playerId_key" ON "CrawlQueue"("playerId");

-- CreateIndex
CREATE INDEX "CrawlQueue_status_priority_idx" ON "CrawlQueue"("status", "priority");

-- CreateIndex
CREATE INDEX "CrawlQueue_createdAt_idx" ON "CrawlQueue"("createdAt");

-- CreateIndex
CREATE INDEX "CrawlStats_timestamp_idx" ON "CrawlStats"("timestamp");
