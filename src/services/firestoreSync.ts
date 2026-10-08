import {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  Asset,
  MaintenanceTicket,
  PeriodicMaintenanceRecord,
  User,
  AuditSession,
  SurgicalSet,
  SurgicalInstrument,
} from '../types';
import { saveImageToDB, getAllImagesFromDB } from './storage';

function cleanForFirestore<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj, (_, v) => (v === undefined ? null : v)));
}

interface RecentChange {
  col:
    | 'assets'
    | 'tickets'
    | 'periodic_records'
    | 'audit_sessions'
    | 'users'
    | 'settings'
    | 'surgical_sets'
    | 'surgical_instruments';
  id: string;
  action: 'set' | 'delete';
  timestamp: number;
}

interface SyncMetaDoc {
  version: number;
  lastUpdated: string;
  recentChanges?: RecentChange[];
  assetsCount?: number;
  ticketsCount?: number;
}

const LOCAL_SYNC_STORAGE = {
  LAST_PROCESSED_TS: 'eco_sync_last_processed_ts',
  INITIALIZED_FLAG: 'eco_sync_initialized_user_db',
};

export class FirestoreSyncService {
  private static isSyncing = false;
  private static quotaExceeded = false;
  private static quotaErrorMessage: string | null = null;
  private static backendUnavailable = false;
  private static metaUnsubscriber: (() => void) | null = null;
  private static onDataChangedCallback: (() => void) | null = null;
  private static statusListeners: Array<(status: { isQuota: boolean; isUnavailable: boolean; message: string | null; isConnected: boolean }) => void> = [];

  static getProjectId(): string {
    return firebaseConfig.projectId || 'hospital-asset-manager-76452';
  }

  static isQuotaLimitReached(): boolean {
    return this.quotaExceeded;
  }

  static isBackendUnavailable(): boolean {
    return this.backendUnavailable;
  }

  static getQuotaErrorMessage(): string | null {
    return this.quotaErrorMessage;
  }

  static onStatusChange(callback: (status: { isQuota: boolean; isUnavailable: boolean; message: string | null; isConnected: boolean }) => void): () => void {
    this.statusListeners.push(callback);
    callback({
      isQuota: this.quotaExceeded,
      isUnavailable: this.backendUnavailable,
      message: this.quotaErrorMessage,
      isConnected: !this.backendUnavailable && !this.quotaExceeded,
    });
    return () => {
      this.statusListeners = this.statusListeners.filter((cb) => cb !== callback);
    };
  }

  private static notifyStatusChange() {
    this.statusListeners.forEach((cb) => {
      try {
        cb({
          isQuota: this.quotaExceeded,
          isUnavailable: this.backendUnavailable,
          message: this.quotaErrorMessage,
          isConnected: !this.backendUnavailable && !this.quotaExceeded,
        });
      } catch {}
    });
  }

  private static handleSyncError(context: string, error: any) {
    const errorStr = error?.message || String(error || '');
    if (
      errorStr.includes('Quota exceeded') ||
      errorStr.includes('quota metric') ||
      errorStr.includes('resource-exhausted') ||
      error?.code === 'resource-exhausted'
    ) {
      this.quotaExceeded = true;
      this.quotaErrorMessage = errorStr;
      console.warn(`[Firestore Quota]: ${context} - Working in local mode.`);
      this.notifyStatusChange();
    } else if (
      errorStr.includes('unavailable') ||
      errorStr.includes('the client is offline') ||
      errorStr.includes('Could not reach Cloud Firestore') ||
      error?.code === 'unavailable'
    ) {
      this.backendUnavailable = true;
      console.warn(`[Firestore Offline]: ${context} - Working in local mode.`);
      this.notifyStatusChange();
    } else {
      console.error(`Firestore ${context} error:`, error);
    }
  }

  /**
   * Initializes real-time listener for multi-device sync
   */
  static initRealtimeListeners(onDataChanged?: () => void) {
    if (onDataChanged) {
      this.onDataChangedCallback = onDataChanged;
    }

    if (this.metaUnsubscriber) {
      this.metaUnsubscriber();
      this.metaUnsubscriber = null;
    }

    try {
      const metaDocRef = doc(db, 'settings', 'sync_meta');

      this.metaUnsubscriber = onSnapshot(
        metaDocRef,
        async (snapshot) => {
          this.backendUnavailable = false;
          this.quotaExceeded = false;
          this.notifyStatusChange();

          if (!snapshot.exists()) {
            await this.bootstrapCloudData();
            return;
          }

          const meta = snapshot.data() as SyncMetaDoc;
          await this.processIncomingDeltaChanges(meta);
        },
        (error) => {
          this.handleSyncError('sync_meta listener', error);
        }
      );

      this.checkAndPerformInitialLoad();
    } catch (err) {
      this.handleSyncError('starting real-time listener', err);
    }
  }

  private static async checkAndPerformInitialLoad(): Promise<void> {
    const isInitialized = localStorage.getItem(LOCAL_SYNC_STORAGE.INITIALIZED_FLAG);
    const localAssets = localStorage.getItem('asset_mgmt_assets');

    if (!isInitialized || !localAssets || localAssets === '[]') {
      console.log('[Firestore]: First-time device load detected. Syncing from cloud...');
      await this.pullAllCloudDataToLocal();
      localStorage.setItem(LOCAL_SYNC_STORAGE.INITIALIZED_FLAG, 'true');
    }
  }

  private static async processIncomingDeltaChanges(meta: SyncMetaDoc): Promise<void> {
    try {
      const lastProcessedTs = parseInt(
        localStorage.getItem(LOCAL_SYNC_STORAGE.LAST_PROCESSED_TS) || '0',
        10
      );

      const recentChanges = Array.isArray(meta.recentChanges) ? meta.recentChanges : [];
      if (recentChanges.length === 0) return;

      const pendingChanges = recentChanges.filter((c) => c.timestamp > lastProcessedTs);
      if (pendingChanges.length === 0) return;

      const oldestBufferedTs = recentChanges[0]?.timestamp || 0;
      if (lastProcessedTs > 0 && lastProcessedTs < oldestBufferedTs) {
        await this.pullAllCloudDataToLocal();
        return;
      }

      let dataModified = false;
      let highestTs = lastProcessedTs;

      for (const change of pendingChanges) {
        highestTs = Math.max(highestTs, change.timestamp);

        if (change.col === 'assets') {
          dataModified = (await this.applyAssetDelta(change)) || dataModified;
        } else if (change.col === 'tickets') {
          dataModified = (await this.applyTicketDelta(change)) || dataModified;
        } else if (change.col === 'periodic_records') {
          dataModified = (await this.applyPeriodicDelta(change)) || dataModified;
        } else if (change.col === 'audit_sessions') {
          dataModified = (await this.applyAuditDelta(change)) || dataModified;
        } else if (change.col === 'users') {
          dataModified = (await this.applyUserDelta(change)) || dataModified;
        } else if (change.col === 'settings' && change.id === 'categories') {
          dataModified = (await this.applyCategoriesDelta()) || dataModified;
        } else if (change.col === 'surgical_sets') {
          dataModified = (await this.applySurgicalSetDelta(change)) || dataModified;
        } else if (change.col === 'surgical_instruments') {
          dataModified = (await this.applySurgicalInstrumentDelta(change)) || dataModified;
        }
      }

      localStorage.setItem(LOCAL_SYNC_STORAGE.LAST_PROCESSED_TS, String(highestTs || Date.now()));

      if (dataModified && this.onDataChangedCallback) {
        this.onDataChangedCallback();
      }
    } catch (err) {
      this.handleSyncError('delta processing', err);
    }
  }

  private static async applyAssetDelta(change: RecentChange): Promise<boolean> {
    try {
      const assetsStr = localStorage.getItem('asset_mgmt_assets');
      const assets: Asset[] = assetsStr ? JSON.parse(assetsStr) : [];

      if (change.action === 'delete') {
        const filtered = assets.filter((a) => a.id !== change.id && a.customId !== change.id);
        localStorage.setItem('asset_mgmt_assets', JSON.stringify(filtered));
        return true;
      } else {
        const snap = await getDoc(doc(db, 'assets', change.id));
        if (snap.exists()) {
          const remoteAsset = snap.data() as Asset;
          const idx = assets.findIndex((a) => a.id === change.id || a.customId === remoteAsset.customId);
          if (idx !== -1) {
            assets[idx] = remoteAsset;
          } else {
            assets.unshift(remoteAsset);
          }
          localStorage.setItem('asset_mgmt_assets', JSON.stringify(assets));
          return true;
        }
      }
    } catch (err) {
      this.handleSyncError('applyAssetDelta', err);
    }
    return false;
  }

  private static async applyTicketDelta(change: RecentChange): Promise<boolean> {
    try {
      const ticketsStr = localStorage.getItem('asset_mgmt_tickets');
      const tickets: MaintenanceTicket[] = ticketsStr ? JSON.parse(ticketsStr) : [];

      if (change.action === 'delete') {
        const filtered = tickets.filter((t) => t.id !== change.id && t.ticketNumber !== change.id);
        localStorage.setItem('asset_mgmt_tickets', JSON.stringify(filtered));
        return true;
      } else {
        const snap = await getDoc(doc(db, 'tickets', change.id));
        if (snap.exists()) {
          const remoteTicket = snap.data() as MaintenanceTicket;
          const idx = tickets.findIndex((t) => t.id === change.id || t.ticketNumber === remoteTicket.ticketNumber);
          if (idx !== -1) {
            tickets[idx] = remoteTicket;
          } else {
            tickets.unshift(remoteTicket);
          }
          localStorage.setItem('asset_mgmt_tickets', JSON.stringify(tickets));
          return true;
        }
      }
    } catch (err) {
      this.handleSyncError('applyTicketDelta', err);
    }
    return false;
  }

  private static async applyPeriodicDelta(change: RecentChange): Promise<boolean> {
    try {
      const recsStr = localStorage.getItem('asset_mgmt_periodic');
      const recs: PeriodicMaintenanceRecord[] = recsStr ? JSON.parse(recsStr) : [];

      if (change.action === 'delete') {
        const filtered = recs.filter((r) => r.id !== change.id);
        localStorage.setItem('asset_mgmt_periodic', JSON.stringify(filtered));
        return true;
      } else {
        const snap = await getDoc(doc(db, 'periodic_records', change.id));
        if (snap.exists()) {
          const remoteRecord = snap.data() as PeriodicMaintenanceRecord;
          const idx = recs.findIndex((r) => r.id === change.id);
          if (idx !== -1) {
            recs[idx] = remoteRecord;
          } else {
            recs.unshift(remoteRecord);
          }
          localStorage.setItem('asset_mgmt_periodic', JSON.stringify(recs));
          return true;
        }
      }
    } catch (err) {
      this.handleSyncError('applyPeriodicDelta', err);
    }
    return false;
  }

  private static async applyAuditDelta(change: RecentChange): Promise<boolean> {
    try {
      const auditsStr = localStorage.getItem('asset_mgmt_audit_sessions');
      const audits: AuditSession[] = auditsStr ? JSON.parse(auditsStr) : [];

      if (change.action === 'delete') {
        const filtered = audits.filter((a) => a.id !== change.id && a.sessionNumber !== change.id);
        localStorage.setItem('asset_mgmt_audit_sessions', JSON.stringify(filtered));
        return true;
      } else {
        const snap = await getDoc(doc(db, 'audit_sessions', change.id));
        if (snap.exists()) {
          const remoteAudit = snap.data() as AuditSession;
          const idx = audits.findIndex((a) => a.id === change.id || a.sessionNumber === remoteAudit.sessionNumber);
          if (idx !== -1) {
            audits[idx] = remoteAudit;
          } else {
            audits.unshift(remoteAudit);
          }
          localStorage.setItem('asset_mgmt_audit_sessions', JSON.stringify(audits));
          return true;
        }
      }
    } catch (err) {
      this.handleSyncError('applyAuditDelta', err);
    }
    return false;
  }

  private static async applyUserDelta(change: RecentChange): Promise<boolean> {
    try {
      const usersStr = localStorage.getItem('asset_mgmt_users');
      const users: User[] = usersStr ? JSON.parse(usersStr) : [];

      if (change.action === 'delete') {
        const filtered = users.filter((u) => u.id !== change.id);
        localStorage.setItem('asset_mgmt_users', JSON.stringify(filtered));
        return true;
      } else {
        const snap = await getDoc(doc(db, 'users', change.id));
        if (snap.exists()) {
          const remoteUser = snap.data() as User;
          const idx = users.findIndex((u) => u.id === change.id);
          if (idx !== -1) {
            users[idx] = remoteUser;
          } else {
            users.push(remoteUser);
          }
          localStorage.setItem('asset_mgmt_users', JSON.stringify(users));
          return true;
        }
      }
    } catch (err) {
      this.handleSyncError('applyUserDelta', err);
    }
    return false;
  }

  private static async applyCategoriesDelta(): Promise<boolean> {
    try {
      const snap = await getDoc(doc(db, 'settings', 'categories'));
      if (snap.exists()) {
        const data = snap.data();
        if (Array.isArray(data?.list)) {
          localStorage.setItem('asset_mgmt_periodic_categories', JSON.stringify(data.list));
          return true;
        }
      }
    } catch (err) {
      this.handleSyncError('applyCategoriesDelta', err);
    }
    return false;
  }

  private static async applySurgicalSetDelta(change: RecentChange): Promise<boolean> {
    try {
      const setsStr = localStorage.getItem('asset_mgmt_surgical_sets');
      const sets: SurgicalSet[] = setsStr ? JSON.parse(setsStr) : [];

      if (change.action === 'delete') {
        const filtered = sets.filter((s) => s.id !== change.id);
        localStorage.setItem('asset_mgmt_surgical_sets', JSON.stringify(filtered));
        return true;
      } else {
        const snap = await getDoc(doc(db, 'surgical_sets', change.id));
        if (snap.exists()) {
          const remoteSet = snap.data() as SurgicalSet;
          const idx = sets.findIndex((s) => s.id === change.id);
          if (idx !== -1) {
            sets[idx] = remoteSet;
          } else {
            sets.unshift(remoteSet);
          }
          localStorage.setItem('asset_mgmt_surgical_sets', JSON.stringify(sets));
          return true;
        }
      }
    } catch (err) {
      this.handleSyncError('applySurgicalSetDelta', err);
    }
    return false;
  }

  private static async applySurgicalInstrumentDelta(change: RecentChange): Promise<boolean> {
    try {
      const instStr = localStorage.getItem('asset_mgmt_surgical_instruments');
      const insts: SurgicalInstrument[] = instStr ? JSON.parse(instStr) : [];

      if (change.action === 'delete') {
        const filtered = insts.filter((i) => i.id !== change.id);
        localStorage.setItem('asset_mgmt_surgical_instruments', JSON.stringify(filtered));
        return true;
      } else {
        const snap = await getDoc(doc(db, 'surgical_instruments', change.id));
        if (snap.exists()) {
          const remoteInst = snap.data() as SurgicalInstrument;
          const idx = insts.findIndex((i) => i.id === change.id);
          if (idx !== -1) {
            insts[idx] = remoteInst;
          } else {
            insts.unshift(remoteInst);
          }
          localStorage.setItem('asset_mgmt_surgical_instruments', JSON.stringify(insts));
          return true;
        }
      }
    } catch (err) {
      this.handleSyncError('applySurgicalInstrumentDelta', err);
    }
    return false;
  }

  private static async emitSyncChange(change: RecentChange): Promise<void> {
    try {
      const metaRef = doc(db, 'settings', 'sync_meta');
      const snap = await getDoc(metaRef);
      let currentChanges: RecentChange[] = [];

      if (snap.exists()) {
        const meta = snap.data() as SyncMetaDoc;
        currentChanges = Array.isArray(meta.recentChanges) ? meta.recentChanges : [];
      }

      currentChanges.push(change);
      if (currentChanges.length > 30) {
        currentChanges = currentChanges.slice(-30);
      }

      await setDoc(
        metaRef,
        {
          version: Date.now(),
          lastUpdated: new Date().toISOString(),
          recentChanges: currentChanges,
        },
        { merge: true }
      );
    } catch (err) {
      this.handleSyncError('emitSyncChange', err);
    }
  }

  // Individual Sync Operations
  static async syncAsset(asset: Asset): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      const updatedAsset: Asset = { ...asset, syncedAt: now };

      // Ensure large raw images are stored safely
      if (updatedAsset.imageUrl && (updatedAsset.imageUrl.startsWith('data:') || updatedAsset.imageUrl.length > 500)) {
        await saveImageToDB(updatedAsset.customId, updatedAsset.imageUrl);
        updatedAsset.imageUrl = `idb://${updatedAsset.customId}`;
      }

      const docRef = doc(db, 'assets', asset.id);
      await setDoc(docRef, cleanForFirestore(updatedAsset), { merge: true });
      await this.emitSyncChange({
        col: 'assets',
        id: asset.id,
        action: 'set',
        timestamp: Date.now(),
      });
      return true;
    } catch (err) {
      this.handleSyncError('syncAsset', err);
      return false;
    }
  }

  static async deleteAsset(assetId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'assets', assetId));
      await this.emitSyncChange({
        col: 'assets',
        id: assetId,
        action: 'delete',
        timestamp: Date.now(),
      });
    } catch (err) {
      this.handleSyncError('deleteAsset', err);
    }
  }

  static async syncTicket(ticket: MaintenanceTicket): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      const updatedTicket: MaintenanceTicket = { ...ticket, syncedAt: now };
      const docRef = doc(db, 'tickets', ticket.id);
      await setDoc(docRef, cleanForFirestore(updatedTicket), { merge: true });
      await this.emitSyncChange({
        col: 'tickets',
        id: ticket.id,
        action: 'set',
        timestamp: Date.now(),
      });
      return true;
    } catch (err) {
      this.handleSyncError('syncTicket', err);
      return false;
    }
  }

  static async deleteTicket(ticketId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'tickets', ticketId));
      await this.emitSyncChange({
        col: 'tickets',
        id: ticketId,
        action: 'delete',
        timestamp: Date.now(),
      });
    } catch (err) {
      this.handleSyncError('deleteTicket', err);
    }
  }

  static async syncPeriodicRecord(record: PeriodicMaintenanceRecord): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      const updated: PeriodicMaintenanceRecord = { ...record, syncedAt: now };
      const docRef = doc(db, 'periodic_records', record.id);
      await setDoc(docRef, cleanForFirestore(updated), { merge: true });
      await this.emitSyncChange({
        col: 'periodic_records',
        id: record.id,
        action: 'set',
        timestamp: Date.now(),
      });
      return true;
    } catch (err) {
      this.handleSyncError('syncPeriodicRecord', err);
      return false;
    }
  }

  static async deletePeriodicRecord(recordId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'periodic_records', recordId));
      await this.emitSyncChange({
        col: 'periodic_records',
        id: recordId,
        action: 'delete',
        timestamp: Date.now(),
      });
    } catch (err) {
      this.handleSyncError('deletePeriodicRecord', err);
    }
  }

  static async syncAuditSession(session: AuditSession): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      const updated: AuditSession = { ...session, syncedAt: now };
      const docRef = doc(db, 'audit_sessions', session.id);
      await setDoc(docRef, cleanForFirestore(updated), { merge: true });
      await this.emitSyncChange({
        col: 'audit_sessions',
        id: session.id,
        action: 'set',
        timestamp: Date.now(),
      });
      return true;
    } catch (err) {
      this.handleSyncError('syncAuditSession', err);
      return false;
    }
  }

  static async deleteAuditSession(sessionId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'audit_sessions', sessionId));
      await this.emitSyncChange({
        col: 'audit_sessions',
        id: sessionId,
        action: 'delete',
        timestamp: Date.now(),
      });
    } catch (err) {
      this.handleSyncError('deleteAuditSession', err);
    }
  }

  static async syncUser(user: User): Promise<void> {
    try {
      const docRef = doc(db, 'users', user.id);
      await setDoc(docRef, cleanForFirestore(user), { merge: true });
      await this.emitSyncChange({
        col: 'users',
        id: user.id,
        action: 'set',
        timestamp: Date.now(),
      });
    } catch (err) {
      this.handleSyncError('syncUser', err);
    }
  }

  static async deleteUser(userId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'users', userId));
      await this.emitSyncChange({
        col: 'users',
        id: userId,
        action: 'delete',
        timestamp: Date.now(),
      });
    } catch (err) {
      this.handleSyncError('deleteUser', err);
    }
  }

  static async syncCategories(categories: string[]): Promise<void> {
    try {
      const docRef = doc(db, 'settings', 'categories');
      await setDoc(docRef, { list: categories, updatedAt: new Date().toISOString() });
      await this.emitSyncChange({
        col: 'settings',
        id: 'categories',
        action: 'set',
        timestamp: Date.now(),
      });
    } catch (err) {
      this.handleSyncError('syncCategories', err);
    }
  }

  static async syncSurgicalSet(set: SurgicalSet): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      const updated: SurgicalSet = { ...set, syncedAt: now };
      const docRef = doc(db, 'surgical_sets', set.id);
      await setDoc(docRef, cleanForFirestore(updated), { merge: true });
      await this.emitSyncChange({
        col: 'surgical_sets',
        id: set.id,
        action: 'set',
        timestamp: Date.now(),
      });
      return true;
    } catch (err) {
      this.handleSyncError('syncSurgicalSet', err);
      return false;
    }
  }

  static async deleteSurgicalSet(setId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'surgical_sets', setId));
      await this.emitSyncChange({
        col: 'surgical_sets',
        id: setId,
        action: 'delete',
        timestamp: Date.now(),
      });
    } catch (err) {
      this.handleSyncError('deleteSurgicalSet', err);
    }
  }

  static async syncSurgicalInstrument(instrument: SurgicalInstrument): Promise<boolean> {
    try {
      const now = new Date().toISOString();
      const updated: SurgicalInstrument = { ...instrument, syncedAt: now };
      const docRef = doc(db, 'surgical_instruments', instrument.id);
      await setDoc(docRef, cleanForFirestore(updated), { merge: true });
      await this.emitSyncChange({
        col: 'surgical_instruments',
        id: instrument.id,
        action: 'set',
        timestamp: Date.now(),
      });
      return true;
    } catch (err) {
      this.handleSyncError('syncSurgicalInstrument', err);
      return false;
    }
  }

  static async deleteSurgicalInstrument(instrumentId: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'surgical_instruments', instrumentId));
      await this.emitSyncChange({
        col: 'surgical_instruments',
        id: instrumentId,
        action: 'delete',
        timestamp: Date.now(),
      });
    } catch (err) {
      this.handleSyncError('deleteSurgicalInstrument', err);
    }
  }

  /**
   * Pushes all local database records to the user's Firestore
   */
  static async pushAllLocalDataToFirestore(): Promise<{ success: boolean; message: string }> {
    if (this.isSyncing) return { success: false, message: 'المزامنة جارية بالفعل...' };
    this.isSyncing = true;

    try {
      const assetsStr = localStorage.getItem('asset_mgmt_assets');
      const ticketsStr = localStorage.getItem('asset_mgmt_tickets');
      const periodicStr = localStorage.getItem('asset_mgmt_periodic');
      const auditsStr = localStorage.getItem('asset_mgmt_audit_sessions');
      const usersStr = localStorage.getItem('asset_mgmt_users');
      const catStr = localStorage.getItem('asset_mgmt_periodic_categories');
      const setsStr = localStorage.getItem('asset_mgmt_surgical_sets');
      const instStr = localStorage.getItem('asset_mgmt_surgical_instruments');

      const assets: Asset[] = assetsStr ? JSON.parse(assetsStr) : [];
      const tickets: MaintenanceTicket[] = ticketsStr ? JSON.parse(ticketsStr) : [];
      const periodic: PeriodicMaintenanceRecord[] = periodicStr ? JSON.parse(periodicStr) : [];
      const audits: AuditSession[] = auditsStr ? JSON.parse(auditsStr) : [];
      const users: User[] = usersStr ? JSON.parse(usersStr) : [];
      const categories: string[] = catStr ? JSON.parse(catStr) : [];
      const sets: SurgicalSet[] = setsStr ? JSON.parse(setsStr) : [];
      const instruments: SurgicalInstrument[] = instStr ? JSON.parse(instStr) : [];

      // 1. Assets in batches of 200
      for (let i = 0; i < assets.length; i += 200) {
        const batch = writeBatch(db);
        const chunk = assets.slice(i, i + 200);
        chunk.forEach((asset) => {
          const safeAsset = { ...asset };
          if (safeAsset.imageUrl && (safeAsset.imageUrl.startsWith('data:') || safeAsset.imageUrl.length > 500)) {
            safeAsset.imageUrl = `idb://${safeAsset.customId}`;
          }
          const ref = doc(db, 'assets', asset.id);
          batch.set(ref, cleanForFirestore(safeAsset), { merge: true });
        });
        await batch.commit();
      }

      // 2. Tickets
      for (let i = 0; i < tickets.length; i += 200) {
        const batch = writeBatch(db);
        const chunk = tickets.slice(i, i + 200);
        chunk.forEach((ticket) => {
          const ref = doc(db, 'tickets', ticket.id);
          batch.set(ref, cleanForFirestore(ticket), { merge: true });
        });
        await batch.commit();
      }

      // 3. Periodic records
      for (let i = 0; i < periodic.length; i += 200) {
        const batch = writeBatch(db);
        const chunk = periodic.slice(i, i + 200);
        chunk.forEach((p) => {
          const ref = doc(db, 'periodic_records', p.id);
          batch.set(ref, cleanForFirestore(p), { merge: true });
        });
        await batch.commit();
      }

      // 4. Audits
      for (let i = 0; i < audits.length; i += 200) {
        const batch = writeBatch(db);
        const chunk = audits.slice(i, i + 200);
        chunk.forEach((a) => {
          const ref = doc(db, 'audit_sessions', a.id);
          batch.set(ref, cleanForFirestore(a), { merge: true });
        });
        await batch.commit();
      }

      // 5. Users
      if (users.length > 0) {
        const batch = writeBatch(db);
        users.forEach((u) => {
          const ref = doc(db, 'users', u.id);
          batch.set(ref, cleanForFirestore(u), { merge: true });
        });
        await batch.commit();
      }

      // 6. Categories
      if (categories.length > 0) {
        await setDoc(doc(db, 'settings', 'categories'), {
          list: categories,
          updatedAt: new Date().toISOString(),
        });
      }

      // 7. Surgical sets
      if (sets.length > 0) {
        for (let i = 0; i < sets.length; i += 200) {
          const batch = writeBatch(db);
          const chunk = sets.slice(i, i + 200);
          chunk.forEach((s) => {
            const ref = doc(db, 'surgical_sets', s.id);
            batch.set(ref, cleanForFirestore(s), { merge: true });
          });
          await batch.commit();
        }
      }

      // 8. Surgical instruments
      if (instruments.length > 0) {
        for (let i = 0; i < instruments.length; i += 200) {
          const batch = writeBatch(db);
          const chunk = instruments.slice(i, i + 200);
          chunk.forEach((inst) => {
            const ref = doc(db, 'surgical_instruments', inst.id);
            batch.set(ref, cleanForFirestore(inst), { merge: true });
          });
          await batch.commit();
        }
      }

      // Update sync_meta
      await setDoc(
        doc(db, 'settings', 'sync_meta'),
        {
          version: Date.now(),
          lastUpdated: new Date().toISOString(),
          assetsCount: assets.length,
          ticketsCount: tickets.length,
          recentChanges: [
            {
              col: 'assets',
              id: 'full_push',
              action: 'set',
              timestamp: Date.now(),
            },
          ],
        },
        { merge: true }
      );

      this.backendUnavailable = false;
      this.quotaExceeded = false;
      this.notifyStatusChange();

      return {
        success: true,
        message: `تم رفع كافة البيانات بنجاح إلى قاعدة بياناتك السحابية (${assets.length} أصل، ${tickets.length} بلاغ صيانة).`,
      };
    } catch (err: any) {
      this.handleSyncError('pushAllLocalData', err);
      return { success: false, message: `فشل الرفع السحابي: ${err?.message || 'خطأ غير متوقع'}` };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Pulls all collections from Firestore into local storage
   */
  static async pullAllCloudDataToLocal(): Promise<{ success: boolean; message: string }> {
    try {
      console.log('[Firestore]: Downloading cloud data...');
      const pullNow = new Date().toISOString();

      // 1. Assets
      const assetsSnap = await getDocs(collection(db, 'assets'));
      if (!assetsSnap.empty) {
        const remoteAssets: Asset[] = [];
        assetsSnap.forEach((d) => {
          const item = d.data() as Asset;
          if (!item.syncedAt) item.syncedAt = item.updatedAt || pullNow;
          remoteAssets.push(item);
        });
        localStorage.setItem('asset_mgmt_assets', JSON.stringify(remoteAssets));
      }

      // 2. Tickets
      const ticketsSnap = await getDocs(collection(db, 'tickets'));
      if (!ticketsSnap.empty) {
        const remoteTickets: MaintenanceTicket[] = [];
        ticketsSnap.forEach((d) => {
          const item = d.data() as MaintenanceTicket;
          if (!item.syncedAt) item.syncedAt = item.updatedAt || pullNow;
          remoteTickets.push(item);
        });
        localStorage.setItem('asset_mgmt_tickets', JSON.stringify(remoteTickets));
      }

      // 3. Periodic Records
      const periodicSnap = await getDocs(collection(db, 'periodic_records'));
      if (!periodicSnap.empty) {
        const remotePeriodic: PeriodicMaintenanceRecord[] = [];
        periodicSnap.forEach((d) => {
          const item = d.data() as PeriodicMaintenanceRecord;
          if (!item.syncedAt) item.syncedAt = item.updatedAt || pullNow;
          remotePeriodic.push(item);
        });
        localStorage.setItem('asset_mgmt_periodic', JSON.stringify(remotePeriodic));
      }

      // 4. Audits
      const auditsSnap = await getDocs(collection(db, 'audit_sessions'));
      if (!auditsSnap.empty) {
        const remoteAudits: AuditSession[] = [];
        auditsSnap.forEach((d) => remoteAudits.push(d.data() as AuditSession));
        localStorage.setItem('asset_mgmt_audit_sessions', JSON.stringify(remoteAudits));
      }

      // 5. Users
      const usersSnap = await getDocs(collection(db, 'users'));
      if (!usersSnap.empty) {
        const remoteUsers: User[] = [];
        usersSnap.forEach((d) => remoteUsers.push(d.data() as User));
        localStorage.setItem('asset_mgmt_users', JSON.stringify(remoteUsers));
      }

      // 6. Categories
      const catSnap = await getDoc(doc(db, 'settings', 'categories'));
      if (catSnap.exists()) {
        const catData = catSnap.data();
        if (catData?.list) {
          localStorage.setItem('asset_mgmt_periodic_categories', JSON.stringify(catData.list));
        }
      }

      // 7. Surgical sets
      const setsSnap = await getDocs(collection(db, 'surgical_sets'));
      if (!setsSnap.empty) {
        const remoteSets: SurgicalSet[] = [];
        setsSnap.forEach((d) => remoteSets.push(d.data() as SurgicalSet));
        localStorage.setItem('asset_mgmt_surgical_sets', JSON.stringify(remoteSets));
      }

      // 8. Surgical instruments
      const instSnap = await getDocs(collection(db, 'surgical_instruments'));
      if (!instSnap.empty) {
        const remoteInsts: SurgicalInstrument[] = [];
        instSnap.forEach((d) => remoteInsts.push(d.data() as SurgicalInstrument));
        localStorage.setItem('asset_mgmt_surgical_instruments', JSON.stringify(remoteInsts));
      }

      localStorage.setItem(LOCAL_SYNC_STORAGE.LAST_PROCESSED_TS, String(Date.now()));
      localStorage.setItem(LOCAL_SYNC_STORAGE.INITIALIZED_FLAG, 'true');

      if (this.onDataChangedCallback) {
        this.onDataChangedCallback();
      }

      this.backendUnavailable = false;
      this.quotaExceeded = false;
      this.notifyStatusChange();

      return {
        success: true,
        message: 'تم تحميل وتحديث كافة البيانات من قاعدة بياناتك السحابية بنجاح.',
      };
    } catch (err: any) {
      this.handleSyncError('pullAllCloudData', err);
      return { success: false, message: `فشل التحميل السحابي: ${err?.message || 'خطأ'}` };
    }
  }

  /**
   * Upload all local images from IndexedDB to the private Firestore cloud
   */
  static async uploadAllImagesToCloud(
    onProgress?: (current: number, total: number, currentKey: string) => void
  ): Promise<{ success: boolean; message: string; count: number }> {
    try {
      const imagesMap = await getAllImagesFromDB();
      const entries = Array.from(imagesMap.entries());
      const total = entries.length;

      if (total === 0) {
        return {
          success: true,
          message: 'لا توجد صور مخزنة محلياً على هذا الجهاز لرفعها.',
          count: 0,
        };
      }

      let uploaded = 0;
      for (let i = 0; i < total; i++) {
        const [rawKey, dataUrl] = entries[i];
        const cleanKey = rawKey.trim().toLowerCase();

        if (onProgress) {
          onProgress(i + 1, total, rawKey);
        }

        const docRef = doc(db, 'asset_cloud_images', cleanKey);
        await setDoc(
          docRef,
          {
            customId: rawKey,
            cleanKey,
            dataUrl,
            updatedAt: new Date().toISOString(),
          },
          { merge: true }
        );
        uploaded++;
      }

      // Mark local assets as hasCloudImage = true
      try {
        const assetsStr = localStorage.getItem('asset_mgmt_assets');
        if (assetsStr) {
          const assets: Asset[] = JSON.parse(assetsStr);
          let modified = false;
          assets.forEach((a) => {
            const k = a.customId.trim().toLowerCase();
            if (imagesMap.has(k) || imagesMap.has(a.customId.trim())) {
              a.hasCloudImage = true;
              modified = true;
            }
          });
          if (modified) {
            localStorage.setItem('asset_mgmt_assets', JSON.stringify(assets));
          }
        }
      } catch {}

      return {
        success: true,
        message: `تم رفع كافة الصور بنجاح إلى السحابة (${uploaded} صورة).`,
        count: uploaded,
      };
    } catch (err: any) {
      this.handleSyncError('uploadAllImagesToCloud', err);
      return {
        success: false,
        message: `فشل رفع الصور: ${err?.message || 'خطأ غير متوقع'}`,
        count: 0,
      };
    }
  }

  /**
   * Fetches an image for a specific asset from cloud on-demand
   */
  static async fetchImageFromCloud(customId: string): Promise<string | null> {
    if (!customId) return null;
    try {
      const cleanKey = customId.trim().toLowerCase();
      const docRef = doc(db, 'asset_cloud_images', cleanKey);
      const snap = await getDoc(docRef);

      if (snap.exists()) {
        const data = snap.data();
        if (data?.dataUrl) {
          // Cache in local IndexedDB so next time it is instant & offline
          await saveImageToDB(customId, data.dataUrl);
          return data.dataUrl;
        }
      }
      return null;
    } catch (err) {
      console.warn(`[Firestore]: Failed to fetch image for ${customId} from cloud:`, err);
      return null;
    }
  }

  static async bootstrapCloudData(): Promise<void> {
    try {
      const localAssetsStr = localStorage.getItem('asset_mgmt_assets');
      const localAssets: Asset[] = localAssetsStr ? JSON.parse(localAssetsStr) : [];
      if (localAssets.length > 0) {
        await this.pushAllLocalDataToFirestore();
      } else {
        await setDoc(doc(db, 'settings', 'sync_meta'), {
          version: 1,
          lastUpdated: new Date().toISOString(),
          recentChanges: [],
        });
      }
    } catch (err) {
      this.handleSyncError('bootstrap', err);
    }
  }
}
