import {
  Asset,
  MaintenanceTicket,
  PeriodicMaintenanceRecord,
  User,
  AuditSession,
  SurgicalSet,
  SurgicalInstrument,
} from '../types';

/**
 * FirestoreSyncService (Local-First Offline Mode)
 * Cloud sync is neutralized. All data is managed safely in local storage and IndexedDB.
 */
export class FirestoreSyncService {
  static isQuotaLimitReached(): boolean {
    return false;
  }

  static isBackendUnavailable(): boolean {
    return false;
  }

  static getQuotaErrorMessage(): string | null {
    return null;
  }

  static getQuotaUpgradeUrl(): string {
    return '';
  }

  static onStatusChange(callback: (status: { isQuota: boolean; isUnavailable: boolean; message: string | null }) => void): () => void {
    callback({
      isQuota: false,
      isUnavailable: false,
      message: null,
    });
    return () => {};
  }

  static getEstimatedSavedReads(): number {
    return 0;
  }

  static initRealtimeListeners(_onDataChanged?: () => void): void {
    // Local-only mode: No remote listeners or Firestore connections
  }

  static async syncAsset(_asset: Asset): Promise<boolean> {
    return true;
  }

  static async deleteAsset(_assetId: string): Promise<void> {}

  static async syncTicket(_ticket: MaintenanceTicket): Promise<boolean> {
    return true;
  }

  static async deleteTicket(_ticketId: string): Promise<void> {}

  static async syncPeriodicRecord(_record: PeriodicMaintenanceRecord): Promise<boolean> {
    return true;
  }

  static async deletePeriodicRecord(_recordId: string): Promise<void> {}

  static async syncAuditSession(_session: AuditSession): Promise<boolean> {
    return true;
  }

  static async deleteAuditSession(_sessionId: string): Promise<void> {}

  static async syncUser(_user: User): Promise<void> {}

  static async deleteUser(_userId: string): Promise<void> {}

  static async syncCategories(_categories: string[]): Promise<void> {}

  static async syncSurgicalSet(_set: SurgicalSet): Promise<boolean> {
    return true;
  }

  static async deleteSurgicalSet(_setId: string): Promise<void> {}

  static async syncSurgicalInstrument(_instrument: SurgicalInstrument): Promise<boolean> {
    return true;
  }

  static async deleteSurgicalInstrument(_instrumentId: string): Promise<void> {}

  static async pushAllLocalDataToFirestore(): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: 'النظام يعمل حالياً في وضع التخزين المحلي الآمن بنسبة 100%.',
    };
  }

  static async pullAllCloudDataToLocal(): Promise<{ success: boolean; message: string }> {
    return {
      success: true,
      message: 'النظام يعمل حالياً في وضع التخزين المحلي الآمن بنسبة 100%.',
    };
  }

  static async bootstrapCloudData(): Promise<void> {}
}
