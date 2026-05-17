-- AlterTable
ALTER TABLE `Reconciliation` ADD COLUMN `batchesDone` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `batchesTotal` INTEGER NOT NULL DEFAULT 0;
