-- CreateTable
CREATE TABLE "Coin" (
    "id" TEXT NOT NULL,
    "mintAddress" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deployerWallet" TEXT NOT NULL,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trendingSince" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "websiteUrl" TEXT,
    "twitterHandle" TEXT,

    CONSTRAINT "Coin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "coinId" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priceUsd" DOUBLE PRECISION NOT NULL,
    "liquidityUsd" DOUBLE PRECISION NOT NULL,
    "liquidityLocked" BOOLEAN NOT NULL,
    "mintAuthorityActive" BOOLEAN NOT NULL,
    "freezeAuthorityActive" BOOLEAN NOT NULL,
    "top10HolderPct" DOUBLE PRECISION NOT NULL,
    "socialVolume" INTEGER NOT NULL,
    "socialSentiment" DOUBLE PRECISION NOT NULL,
    "tradeVolume24h" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OsintProfile" (
    "id" TEXT NOT NULL,
    "coinId" TEXT NOT NULL,
    "deployerPriorLaunches" INTEGER NOT NULL,
    "deployerRugCount" INTEGER NOT NULL,
    "walletClusterFlag" BOOLEAN NOT NULL,
    "twitterAccountAgeDays" INTEGER,
    "domainAgeDays" INTEGER,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OsintProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coin_mintAddress_key" ON "Coin"("mintAddress");

-- CreateIndex
CREATE INDEX "Coin_trendingSince_idx" ON "Coin"("trendingSince");

-- CreateIndex
CREATE INDEX "Snapshot_coinId_takenAt_idx" ON "Snapshot"("coinId", "takenAt");

-- CreateIndex
CREATE UNIQUE INDEX "OsintProfile_coinId_key" ON "OsintProfile"("coinId");

-- AddForeignKey
ALTER TABLE "Snapshot" ADD CONSTRAINT "Snapshot_coinId_fkey" FOREIGN KEY ("coinId") REFERENCES "Coin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OsintProfile" ADD CONSTRAINT "OsintProfile_coinId_fkey" FOREIGN KEY ("coinId") REFERENCES "Coin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

