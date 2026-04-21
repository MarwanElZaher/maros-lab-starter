-- CreateTable
CREATE TABLE "rfp_analyses" (
    "id" TEXT NOT NULL,
    "rfpId" TEXT NOT NULL,
    "submitterEmail" TEXT NOT NULL,
    "clientName" TEXT,
    "pdfObjectPath" TEXT NOT NULL,
    "recommendation" JSONB NOT NULL,
    "decision" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "redFlagCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rfp_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rfp_analyses_rfpId_key" ON "rfp_analyses"("rfpId");
