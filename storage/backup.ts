import type { BackupPartPlan, BackupSource, RestoreCounts } from './web/backup';

export const backupAvailable = false;
const unavailable = () => { throw new Error('备份目前仅在网页版本可用。'); };
export const planBackup = async (_source: BackupSource): Promise<{ backupId: string; exportedAt: string; parts: BackupPartPlan[] }> => unavailable();
export const createBackupPart = async (_source: BackupSource, _plan: { backupId: string; exportedAt: string; parts: BackupPartPlan[] }, _partIndex: number): Promise<{ blob: Blob; filename: string }> => unavailable();
export const saveBackupPart = async (_blob: Blob, _filename: string): Promise<void> => unavailable();
export const validateRestore = async (_files: File[]) => unavailable() as never;
export const restoreValidatedParts = async (_source: BackupSource, _parts: never): Promise<RestoreCounts> => unavailable();
export const backupSource: BackupSource | null = null;
