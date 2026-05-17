-- Promote LOW_CONFIDENCE from a LineRelation enum value to an orthogonal boolean
-- flag. La consigna del challenge define 4 relaciones (match, parcial, faltante,
-- sobrante); la baja confianza es una marca sobre la relación, no una relación
-- en sí.

ALTER TABLE `ReconciliationLine`
  ADD COLUMN `lowConfidence` BOOLEAN NOT NULL DEFAULT FALSE AFTER `confidence`;

UPDATE `ReconciliationLine`
SET `lowConfidence` = TRUE
WHERE `relation` = 'LOW_CONFIDENCE';

UPDATE `ReconciliationLine`
SET `relation` = CASE
  WHEN `requestItemId` IS NULL THEN 'EXTRA'
  ELSE 'MATCH'
END
WHERE `relation` = 'LOW_CONFIDENCE';

ALTER TABLE `ReconciliationLine`
  MODIFY COLUMN `relation` ENUM('MATCH', 'PARTIAL_QUANTITY', 'MISSING_FROM_OFFER', 'EXTRA') NOT NULL;
