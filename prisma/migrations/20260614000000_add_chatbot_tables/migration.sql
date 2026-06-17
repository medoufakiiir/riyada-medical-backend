-- CreateTable
CREATE TABLE "ChatbotSession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ar',
    "pageUrl" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "ChatbotSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ar',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatbotMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatbotAppointment" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "parentName" TEXT NOT NULL,
    "childName" TEXT NOT NULL,
    "childAge" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "preferredTime" TEXT,
    "notes" TEXT,
    "language" TEXT NOT NULL DEFAULT 'ar',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "source" TEXT NOT NULL DEFAULT 'chatbot',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatbotAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatbotSession_sessionId_key" ON "ChatbotSession"("sessionId");
CREATE INDEX "ChatbotSession_startedAt_idx" ON "ChatbotSession"("startedAt");
CREATE INDEX "ChatbotMessage_sessionId_idx" ON "ChatbotMessage"("sessionId");
CREATE INDEX "ChatbotMessage_createdAt_idx" ON "ChatbotMessage"("createdAt");
CREATE INDEX "ChatbotAppointment_createdAt_idx" ON "ChatbotAppointment"("createdAt");
CREATE INDEX "ChatbotAppointment_status_idx" ON "ChatbotAppointment"("status");

-- AddForeignKey
ALTER TABLE "ChatbotMessage" ADD CONSTRAINT "ChatbotMessage_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "ChatbotSession"("sessionId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatbotAppointment" ADD CONSTRAINT "ChatbotAppointment_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "ChatbotSession"("sessionId") ON DELETE SET NULL ON UPDATE CASCADE;
