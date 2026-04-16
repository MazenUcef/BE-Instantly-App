-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('customer', 'supplier', 'admin');

-- CreateEnum
CREATE TYPE "BiometricType" AS ENUM ('faceid', 'fingerprint', 'passcode');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('contract', 'daily');

-- CreateEnum
CREATE TYPE "OrderCancelledBy" AS ENUM ('customer', 'supplier', 'system', 'admin');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('pending', 'accepted', 'rejected', 'expired', 'completed', 'withdrawn');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('started', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "SessionCancelledBy" AS ENUM ('customer', 'supplier', 'system', 'admin');

-- CreateEnum
CREATE TYPE "CallType" AS ENUM ('audio', 'video');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('initiated', 'ringing', 'accepted', 'declined', 'missed', 'ended', 'failed');

-- CreateEnum
CREATE TYPE "CallEndReason" AS ENUM ('caller_ended', 'receiver_ended', 'missed', 'declined', 'failed', 'busy');

-- CreateEnum
CREATE TYPE "BundleBookingStatus" AS ENUM ('pending_supplier_approval', 'pending_customer_approval', 'accepted', 'rejected', 'in_progress', 'done', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "BundleBookingCancelledBy" AS ENUM ('customer', 'supplier');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'customer',
    "categoryId" UUID,
    "address" TEXT NOT NULL,
    "profilePicture" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isPhoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "isProfileComplete" BOOLEAN NOT NULL DEFAULT false,
    "averageRating" DECIMAL(3,2) NOT NULL DEFAULT 0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "jobTitles" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBiometric" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" "BiometricType" NOT NULL,
    "passcodeHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBiometric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGovernment" (
    "userId" UUID NOT NULL,
    "governmentId" UUID NOT NULL,

    CONSTRAINT "UserGovernment_pkey" PRIMARY KEY ("userId","governmentId")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "jobs" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategoryWorkflow" (
    "id" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "steps" TEXT[],

    CONSTRAINT "CategoryWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Government" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "normalizedNameAr" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'Egypt',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Government_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "customerName" TEXT NOT NULL,
    "supplierId" UUID,
    "categoryId" UUID NOT NULL,
    "governmentId" UUID NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requestedPrice" DECIMAL(12,2) NOT NULL,
    "orderType" "OrderType" NOT NULL DEFAULT 'daily',
    "selectedWorkflow" TEXT NOT NULL,
    "expectedDays" INTEGER,
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "finalPrice" DECIMAL(12,2),
    "customerReviewed" BOOLEAN NOT NULL DEFAULT false,
    "supplierReviewed" BOOLEAN NOT NULL DEFAULT false,
    "timeToStart" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "estimatedDuration" INTEGER,
    "images" JSONB NOT NULL DEFAULT '[]',
    "files" JSONB NOT NULL DEFAULT '[]',
    "cancelledBy" "OrderCancelledBy",
    "cancellationReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Offer" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "estimatedDuration" INTEGER,
    "expectedDays" INTEGER,
    "timeToStart" TIMESTAMP(3),
    "status" "OfferStatus" NOT NULL DEFAULT 'pending',
    "expiresAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "withdrawnAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSession" (
    "id" UUID NOT NULL,
    "orderId" UUID,
    "offerId" UUID,
    "bundleBookingId" UUID,
    "customerId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "workflowSteps" TEXT[],
    "stepTimestamps" JSONB NOT NULL DEFAULT '{}',
    "paymentConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "paymentConfirmedAt" TIMESTAMP(3),
    "status" "SessionStatus" NOT NULL DEFAULT 'started',
    "cancelledBy" "SessionCancelledBy",
    "cancellationReason" TEXT,
    "startedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "senderId" UUID NOT NULL,
    "receiverId" UUID NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallSession" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "callerId" UUID NOT NULL,
    "receiverId" UUID NOT NULL,
    "type" "CallType" NOT NULL DEFAULT 'audio',
    "status" "CallStatus" NOT NULL DEFAULT 'initiated',
    "startedAt" TIMESTAMP(3),
    "answeredAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" "CallEndReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Review" (
    "id" UUID NOT NULL,
    "reviewerId" UUID NOT NULL,
    "targetUserId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "sessionId" UUID,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierAvailability" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Cairo',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupplierAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyScheduleItem" (
    "id" UUID NOT NULL,
    "availabilityId" UUID NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "isWorking" BOOLEAN NOT NULL DEFAULT false,
    "startTime" TEXT,
    "endTime" TEXT,
    "slotDurationMinutes" INTEGER NOT NULL DEFAULT 60,
    "breakStart" TEXT,
    "breakEnd" TEXT,

    CONSTRAINT "WeeklyScheduleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockedDate" (
    "id" UUID NOT NULL,
    "availabilityId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT,
    "isFullDay" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT,
    "endTime" TEXT,

    CONSTRAINT "BlockedDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bundle" (
    "id" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT NOT NULL,
    "image" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "oldPrice" DECIMAL(12,2),
    "durationMinutes" INTEGER NOT NULL DEFAULT 60,
    "includes" TEXT[],
    "tags" TEXT[],
    "selectedWorkflow" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BundleGovernment" (
    "bundleId" UUID NOT NULL,
    "governmentId" UUID NOT NULL,

    CONSTRAINT "BundleGovernment_pkey" PRIMARY KEY ("bundleId","governmentId")
);

-- CreateTable
CREATE TABLE "BundleBooking" (
    "id" UUID NOT NULL,
    "bundleId" UUID NOT NULL,
    "supplierId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "governmentId" UUID NOT NULL,
    "address" TEXT NOT NULL,
    "notes" TEXT,
    "bookedDate" TEXT NOT NULL,
    "slotStart" TEXT NOT NULL,
    "slotEnd" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "BundleBookingStatus" NOT NULL DEFAULT 'pending_supplier_approval',
    "paymentConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "paymentConfirmedAt" TIMESTAMP(3),
    "finalPrice" DECIMAL(12,2) NOT NULL,
    "selectedWorkflow" TEXT,
    "customerReviewed" BOOLEAN NOT NULL DEFAULT false,
    "supplierReviewed" BOOLEAN NOT NULL DEFAULT false,
    "rejectionReason" TEXT,
    "cancelledBy" "BundleBookingCancelledBy",
    "proposedBookedDate" TEXT,
    "proposedSlotStart" TEXT,
    "proposedSlotEnd" TEXT,
    "proposedScheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BundleBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumber_key" ON "User"("phoneNumber");

-- CreateIndex
CREATE INDEX "User_role_categoryId_idx" ON "User"("role", "categoryId");

-- CreateIndex
CREATE INDEX "User_isEmailVerified_idx" ON "User"("isEmailVerified");

-- CreateIndex
CREATE INDEX "User_isProfileComplete_idx" ON "User"("isProfileComplete");

-- CreateIndex
CREATE INDEX "UserBiometric_userId_idx" ON "UserBiometric"("userId");

-- CreateIndex
CREATE INDEX "UserBiometric_deviceId_idx" ON "UserBiometric"("deviceId");

-- CreateIndex
CREATE INDEX "UserGovernment_governmentId_idx" ON "UserGovernment"("governmentId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_normalizedName_key" ON "Category"("normalizedName");

-- CreateIndex
CREATE INDEX "Category_isActive_createdAt_idx" ON "Category"("isActive", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryWorkflow_categoryId_key_key" ON "CategoryWorkflow"("categoryId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Government_normalizedName_key" ON "Government"("normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "Government_normalizedNameAr_key" ON "Government"("normalizedNameAr");

-- CreateIndex
CREATE INDEX "Government_isActive_order_name_idx" ON "Government"("isActive", "order", "name");

-- CreateIndex
CREATE INDEX "Order_categoryId_governmentId_status_createdAt_idx" ON "Order"("categoryId", "governmentId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_customerId_status_createdAt_idx" ON "Order"("customerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Order_supplierId_status_updatedAt_idx" ON "Order"("supplierId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Order_customerId_customerReviewed_status_updatedAt_idx" ON "Order"("customerId", "customerReviewed", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Offer_orderId_status_createdAt_idx" ON "Offer"("orderId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Offer_supplierId_status_createdAt_idx" ON "Offer"("supplierId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Offer_supplierId_updatedAt_idx" ON "Offer"("supplierId", "updatedAt");

-- CreateIndex
CREATE INDEX "Offer_supplierId_status_timeToStart_idx" ON "Offer"("supplierId", "status", "timeToStart");

-- CreateIndex
CREATE INDEX "JobSession_customerId_status_updatedAt_idx" ON "JobSession"("customerId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "JobSession_supplierId_status_updatedAt_idx" ON "JobSession"("supplierId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "JobSession_status_updatedAt_idx" ON "JobSession"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_sessionId_createdAt_idx" ON "Message"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_receiverId_read_createdAt_idx" ON "Message"("receiverId", "read", "createdAt");

-- CreateIndex
CREATE INDEX "Message_sessionId_receiverId_read_idx" ON "Message"("sessionId", "receiverId", "read");

-- CreateIndex
CREATE INDEX "CallSession_sessionId_status_idx" ON "CallSession"("sessionId", "status");

-- CreateIndex
CREATE INDEX "CallSession_callerId_createdAt_idx" ON "CallSession"("callerId", "createdAt");

-- CreateIndex
CREATE INDEX "CallSession_receiverId_createdAt_idx" ON "CallSession"("receiverId", "createdAt");

-- CreateIndex
CREATE INDEX "CallSession_sessionId_createdAt_idx" ON "CallSession"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_createdAt_idx" ON "Notification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_type_createdAt_idx" ON "Notification"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "Review_targetUserId_createdAt_idx" ON "Review"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Review_orderId_createdAt_idx" ON "Review"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Review_reviewerId_orderId_key" ON "Review"("reviewerId", "orderId");

-- CreateIndex
CREATE UNIQUE INDEX "SupplierAvailability_supplierId_key" ON "SupplierAvailability"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyScheduleItem_availabilityId_dayOfWeek_key" ON "WeeklyScheduleItem"("availabilityId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "BlockedDate_availabilityId_date_idx" ON "BlockedDate"("availabilityId", "date");

-- CreateIndex
CREATE INDEX "Bundle_supplierId_isActive_createdAt_idx" ON "Bundle"("supplierId", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "Bundle_categoryId_isActive_createdAt_idx" ON "Bundle"("categoryId", "isActive", "createdAt");

-- CreateIndex
CREATE INDEX "Bundle_supplierId_categoryId_createdAt_idx" ON "Bundle"("supplierId", "categoryId", "createdAt");

-- CreateIndex
CREATE INDEX "BundleGovernment_governmentId_idx" ON "BundleGovernment"("governmentId");

-- CreateIndex
CREATE INDEX "BundleBooking_supplierId_status_scheduledAt_idx" ON "BundleBooking"("supplierId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "BundleBooking_customerId_status_scheduledAt_idx" ON "BundleBooking"("customerId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "BundleBooking_bundleId_scheduledAt_idx" ON "BundleBooking"("bundleId", "scheduledAt");

-- CreateIndex
CREATE INDEX "BundleBooking_supplierId_bookedDate_slotStart_slotEnd_idx" ON "BundleBooking"("supplierId", "bookedDate", "slotStart", "slotEnd");

-- CreateIndex
CREATE INDEX "BundleBooking_customerId_createdAt_idx" ON "BundleBooking"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "BundleBooking_customerId_bookedDate_slotStart_slotEnd_idx" ON "BundleBooking"("customerId", "bookedDate", "slotStart", "slotEnd");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBiometric" ADD CONSTRAINT "UserBiometric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGovernment" ADD CONSTRAINT "UserGovernment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGovernment" ADD CONSTRAINT "UserGovernment_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategoryWorkflow" ADD CONSTRAINT "CategoryWorkflow_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSession" ADD CONSTRAINT "JobSession_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSession" ADD CONSTRAINT "JobSession_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSession" ADD CONSTRAINT "JobSession_bundleBookingId_fkey" FOREIGN KEY ("bundleBookingId") REFERENCES "BundleBooking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSession" ADD CONSTRAINT "JobSession_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSession" ADD CONSTRAINT "JobSession_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "JobSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "JobSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_callerId_fkey" FOREIGN KEY ("callerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallSession" ADD CONSTRAINT "CallSession_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "JobSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAvailability" ADD CONSTRAINT "SupplierAvailability_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyScheduleItem" ADD CONSTRAINT "WeeklyScheduleItem_availabilityId_fkey" FOREIGN KEY ("availabilityId") REFERENCES "SupplierAvailability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockedDate" ADD CONSTRAINT "BlockedDate_availabilityId_fkey" FOREIGN KEY ("availabilityId") REFERENCES "SupplierAvailability"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bundle" ADD CONSTRAINT "Bundle_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bundle" ADD CONSTRAINT "Bundle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleGovernment" ADD CONSTRAINT "BundleGovernment_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleGovernment" ADD CONSTRAINT "BundleGovernment_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleBooking" ADD CONSTRAINT "BundleBooking_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "Bundle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleBooking" ADD CONSTRAINT "BundleBooking_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleBooking" ADD CONSTRAINT "BundleBooking_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleBooking" ADD CONSTRAINT "BundleBooking_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BundleBooking" ADD CONSTRAINT "BundleBooking_governmentId_fkey" FOREIGN KEY ("governmentId") REFERENCES "Government"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
