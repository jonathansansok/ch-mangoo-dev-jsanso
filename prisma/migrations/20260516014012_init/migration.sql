-- CreateTable
CREATE TABLE `PurchaseRequest` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `externalId` VARCHAR(64) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `PurchaseRequest_externalId_key`(`externalId`),
    INDEX `PurchaseRequest_externalId_idx`(`externalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PurchaseRequestItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requestId` INTEGER NOT NULL,
    `externalItemId` INTEGER NOT NULL,
    `description` VARCHAR(500) NOT NULL,
    `quantity` DECIMAL(14, 3) NOT NULL,
    `unit` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PurchaseRequestItem_requestId_idx`(`requestId`),
    UNIQUE INDEX `PurchaseRequestItem_requestId_externalItemId_key`(`requestId`, `externalItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Offer` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `requestId` INTEGER NOT NULL,
    `supplierName` VARCHAR(255) NULL,
    `offerDate` DATETIME(3) NULL,
    `sourceFile` VARCHAR(500) NOT NULL,
    `sourceFileHash` VARCHAR(64) NOT NULL,
    `sourceFileMime` VARCHAR(128) NOT NULL,
    `observations` TEXT NULL,
    `status` ENUM('PENDING', 'EXTRACTING', 'EXTRACTED', 'RECONCILING', 'RECONCILED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `failureReason` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Offer_sourceFileHash_key`(`sourceFileHash`),
    INDEX `Offer_requestId_idx`(`requestId`),
    INDEX `Offer_sourceFileHash_idx`(`sourceFileHash`),
    INDEX `Offer_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OfferItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `offerId` INTEGER NOT NULL,
    `lineNumber` INTEGER NOT NULL,
    `supplierCode` VARCHAR(64) NULL,
    `description` VARCHAR(500) NOT NULL,
    `quantity` DECIMAL(14, 3) NULL,
    `unitPrice` DECIMAL(14, 4) NULL,
    `currency` VARCHAR(8) NULL,
    `unit` VARCHAR(64) NULL,
    `rawObservations` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OfferItem_offerId_idx`(`offerId`),
    UNIQUE INDEX `OfferItem_offerId_lineNumber_key`(`offerId`, `lineNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Reconciliation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `offerId` INTEGER NOT NULL,
    `requestId` INTEGER NOT NULL,
    `summary` LONGTEXT NULL,
    `itemsCovered` INTEGER NOT NULL DEFAULT 0,
    `itemsMissing` INTEGER NOT NULL DEFAULT 0,
    `itemsExtra` INTEGER NOT NULL DEFAULT 0,
    `itemsPartial` INTEGER NOT NULL DEFAULT 0,
    `itemsLowConfidence` INTEGER NOT NULL DEFAULT 0,
    `totalPromptTokens` INTEGER NOT NULL DEFAULT 0,
    `totalCompletionTokens` INTEGER NOT NULL DEFAULT 0,
    `totalCostUsd` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Reconciliation_offerId_key`(`offerId`),
    INDEX `Reconciliation_requestId_idx`(`requestId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReconciliationLine` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `reconciliationId` INTEGER NOT NULL,
    `offerItemId` INTEGER NULL,
    `requestItemId` INTEGER NULL,
    `relation` ENUM('MATCH', 'PARTIAL_QUANTITY', 'MISSING_FROM_OFFER', 'EXTRA', 'LOW_CONFIDENCE') NOT NULL,
    `confidence` DECIMAL(4, 3) NOT NULL,
    `embeddingSimilarity` DECIMAL(4, 3) NULL,
    `quantityRequested` DECIMAL(14, 3) NULL,
    `quantityOffered` DECIMAL(14, 3) NULL,
    `rationale` VARCHAR(500) NOT NULL,
    `flags` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReconciliationLine_reconciliationId_idx`(`reconciliationId`),
    INDEX `ReconciliationLine_offerItemId_idx`(`offerItemId`),
    INDEX `ReconciliationLine_requestItemId_idx`(`requestItemId`),
    INDEX `ReconciliationLine_relation_idx`(`relation`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DecisionLog` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `offerId` INTEGER NULL,
    `reconciliationLineId` INTEGER NULL,
    `kind` ENUM('EXTRACT_HEADER', 'EXTRACT_ITEMS', 'EMBED_REQUEST', 'EMBED_OFFER', 'JUDGE_BATCH') NOT NULL,
    `model` VARCHAR(64) NOT NULL,
    `promptTokens` INTEGER NOT NULL DEFAULT 0,
    `completionTokens` INTEGER NOT NULL DEFAULT 0,
    `costUsd` DECIMAL(10, 6) NOT NULL DEFAULT 0,
    `prompt` LONGTEXT NOT NULL,
    `rawResponse` LONGTEXT NOT NULL,
    `candidatesConsidered` JSON NULL,
    `durationMs` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `DecisionLog_offerId_idx`(`offerId`),
    INDEX `DecisionLog_kind_createdAt_idx`(`kind`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ExtractionCache` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `fileHash` VARCHAR(64) NOT NULL,
    `fileName` VARCHAR(500) NOT NULL,
    `mime` VARCHAR(128) NOT NULL,
    `payload` JSON NOT NULL,
    `model` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ExtractionCache_fileHash_key`(`fileHash`),
    INDEX `ExtractionCache_fileHash_idx`(`fileHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `PurchaseRequestItem` ADD CONSTRAINT `PurchaseRequestItem_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `PurchaseRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Offer` ADD CONSTRAINT `Offer_requestId_fkey` FOREIGN KEY (`requestId`) REFERENCES `PurchaseRequest`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OfferItem` ADD CONSTRAINT `OfferItem_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `Offer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Reconciliation` ADD CONSTRAINT `Reconciliation_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `Offer`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReconciliationLine` ADD CONSTRAINT `ReconciliationLine_reconciliationId_fkey` FOREIGN KEY (`reconciliationId`) REFERENCES `Reconciliation`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReconciliationLine` ADD CONSTRAINT `ReconciliationLine_offerItemId_fkey` FOREIGN KEY (`offerItemId`) REFERENCES `OfferItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReconciliationLine` ADD CONSTRAINT `ReconciliationLine_requestItemId_fkey` FOREIGN KEY (`requestItemId`) REFERENCES `PurchaseRequestItem`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DecisionLog` ADD CONSTRAINT `DecisionLog_offerId_fkey` FOREIGN KEY (`offerId`) REFERENCES `Offer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DecisionLog` ADD CONSTRAINT `DecisionLog_reconciliationLineId_fkey` FOREIGN KEY (`reconciliationLineId`) REFERENCES `ReconciliationLine`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
