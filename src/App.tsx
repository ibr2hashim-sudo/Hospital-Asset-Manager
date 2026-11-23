import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  Mail,
  Phone,
} from 'lucide-react';
import { Asset, MaintenanceTicket, PeriodicMaintenanceRecord, SystemSettings, User } from './types';
import { StorageService } from './services/storage';
import { FirestoreSyncService } from './services/firestoreSync';
import { SystemSettingsService } from './services/systemSettings';
import { Navbar } from './components/Navbar';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { AssetsView } from './components/AssetsView';
import { MaintenanceTicketsView } from './components/MaintenanceTicketsView';
import { PeriodicMaintenanceView } from './components/PeriodicMaintenanceView';
import { AuditView } from './components/AuditView';
import { SurgicalSetsView } from './components/SurgicalSetsView';
import { UserManagementView } from './components/UserManagementView';
import { SyncSettingsModal } from './components/SyncSettingsModal';
import { HistoryModal } from './components/HistoryModal';
import { FactoryResetModal } from './components/FactoryResetModal';

type ActiveView = 'dashboard' | 'assets' | 'tickets' | 'periodic' | 'audit' | 'surgical' | 'users';

const VALID_VIEWS: ActiveView[] = ['dashboard', 'assets', 'tickets', 'periodic', 'audit', 'surgical', 'users'];

function parseViewFromHash(hash: string): ActiveView {
  const clean = (hash || '').replace(/^#\/?/, '').split('/')[0] as ActiveView;
  return VALID_VIEWS.includes(clean) ? clean : 'dashboard';
}

export default function App() {
  // Global State
  const [currentUser, setCurrentUser] = useState<User | null>(StorageService.getCurrentUser());
  const [assets, setAssets] = useState<Asset[]>([]);
  const [tickets, setTickets] = useState<MaintenanceTicket[]>([]);
  const [periodicRecords, setPeriodicRecords] = useState<PeriodicMaintenanceRecord[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [pendingSyncCount, setPendingSyncCount] = useState<number>(0);
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [systemSettings, setSystemSettings] = useState<SystemSettings>(() => {
    const s = SystemSettingsService.getSettings();
    SystemSettingsService.applyToDocument(s);
    return s;
  });

  // Active Navigation View synced with URL Hash & Browser History
  const [activeView, setActiveView] = useState<ActiveView>(() =>
    parseViewFromHash(typeof window !== 'undefined' ? window.location.hash : '')
  );

  // Modal Triggers
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showFactoryResetModal, setShowFactoryResetModal] = useState(false);

  // Cross-view action state (e.g. create ticket for specific asset)
  const [ticketTargetAsset, setTicketTargetAsset] = useState<Asset | null>(null);

  // Navigate to a primary view and push a browser history entry so Back button works naturally
  const navigateToView = useCallback(
    (nextView: ActiveView) => {
      const target = VALID_VIEWS.includes(nextView) ? nextView : 'dashboard';
      if (target !== activeView || window.history.state?.sub || window.history.state?.modal) {
        window.history.pushState(
          { appManaged: true, view: target, modal: null, sub: null },
          '',
          `#${target}`
        );
      }
      setShowSyncModal(false);
      setShowHistoryModal(false);
      setShowFactoryResetModal(false);
      setActiveView(target);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [activeView]
  );

  const openAppModal = useCallback(
    (modal: 'sync' | 'history' | 'reset') => {
      window.history.pushState(
        {
          appManaged: true,
          view: activeView,
          modal,
          sub: window.history.state?.sub || null,
        },
        '',
        `#${activeView}`
      );
      if (modal === 'sync') setShowSyncModal(true);
      if (modal === 'history') setShowHistoryModal(true);
      if (modal === 'reset') setShowFactoryResetModal(true);
    },
    [activeView]
  );

  const closeAppModal = useCallback((modal: 'sync' | 'history' | 'reset') => {
    if (window.history.state?.modal === modal) {
      window.history.back();
      return;
    }
    if (modal === 'sync') setShowSyncModal(false);
    if (modal === 'history') setShowHistoryModal(false);
    if (modal === 'reset') setShowFactoryResetModal(false);
  }, []);

  // Reload all data from StorageService
  const reloadData = useCallback(() => {
    setAssets(StorageService.getAssets());
    setTickets(StorageService.getTickets());
    setPeriodicRecords(StorageService.getPeriodicRecords());
    setUsers(StorageService.getUsers());
    setPendingSyncCount(StorageService.getPendingSyncCount());
    setCurrentUser(StorageService.getCurrentUser());
    const latestSettings = SystemSettingsService.getSettings();
    SystemSettingsService.applyToDocument(latestSettings);
    setSystemSettings(latestSettings);
  }, []);

  // Ensure initial history state and listen to browser Back / Forward (popstate)
  useEffect(() => {
    const initial = parseViewFromHash(window.location.hash);
    if (!window.history.state?.appManaged) {
      window.history.replaceState(
        { appManaged: true, view: initial, modal: null, sub: null },
        '',
        `#${initial}`
      );
    }

    const handlePopState = (e: PopStateEvent) => {
      const st = e.state as { appManaged?: boolean; view?: ActiveView; modal?: string | null } | null;
      const targetView = st?.view || parseViewFromHash(window.location.hash);
      setShowSyncModal(st?.modal === 'sync');
      setShowHistoryModal(st?.modal === 'history');
      setShowFactoryResetModal(st?.modal === 'reset');
      setActiveView(VALID_VIEWS.includes(targetView) ? targetView : 'dashboard');
    };

    const handleSettingsUpdated = () => {
      const latest = SystemSettingsService.getSettings();
      SystemSettingsService.applyToDocument(latest);
      setSystemSettings(latest);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('system-settings-updated', handleSettingsUpdated);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('system-settings-updated', handleSettingsUpdated);
    };
  }, []);

  // Initial load & real-time sync with user's Firebase
  useEffect(() => {
    reloadData();

    // Start real-time sync with User's Firebase
    FirestoreSyncService.initRealtimeListeners(() => {
      reloadData();
    });

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [reloadData]);

  // Navigate directly to create ticket for an asset
  const handleCreateTicketForAsset = (asset: Asset) => {
    setTicketTargetAsset(asset);
    navigateToView('tickets');
  };

  // Pending ticket notification count (Only for Admin + Maintenance Technician)
  const isStaffForTicketAlerts = currentUser?.role === 'admin' || currentUser?.role === 'technician';
  const pendingTicketsCount = isStaffForTicketAlerts
    ? tickets.filter((t) => t.status === 'معلق').length
    : 0;

  // 🚪 If no user is logged in, display the Login View as the first screen
  if (!currentUser) {
    return (
      <LoginView
        onLogin={(user) => {
          setCurrentUser(user);
          reloadData();
          window.history.replaceState(
            { appManaged: true, view: 'dashboard', modal: null, sub: null },
            '',
            '#dashboard'
          );
          setActiveView('dashboard');
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-app text-right flex flex-col justify-between" dir="rtl">
      {/* Top Main Navigation Bar (Single Unified Header) */}
      <div className="print:hidden">
        <Navbar
          currentUser={currentUser}
          activeTab={activeView}
          setActiveTab={(tab: string) => navigateToView(tab as ActiveView)}
          isOnline={isOnline}
          isSyncing={isSyncing}
          pendingCount={pendingSyncCount}
          lastSyncTime={StorageService.getSyncConfig().lastSyncTimestamp}
          onManualSync={() => {
            setIsSyncing(true);
            StorageService.triggerManualSync()
              .then((res) => {
                reloadData();
                alert(res.message);
              })
              .catch((err) => {
                alert(err?.message || 'فشلت المزامنة اليدوية');
              })
              .finally(() => setIsSyncing(false));
          }}
          onOpenHistory={() => openAppModal('history')}
          onOpenReset={() => openAppModal('reset')}
          onOpenSyncSettings={() => openAppModal('sync')}
          onLogout={() => {
            StorageService.logout();
            reloadData();
          }}
          ticketPendingCount={pendingTicketsCount}
          assetsCount={assets.length}
          usersCount={users.length}
          systemSettings={systemSettings}
        />
      </div>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 flex-1 w-full print:p-0 print:m-0 print:max-w-full print:w-full">
        {/* Role Notice for Supervisor */}
        {currentUser?.role === 'supervisor' && (
          <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3.5 flex items-center gap-2 text-xs text-purple-900 shadow-xs print:hidden">
            <Building2 className="w-4 h-4 text-purple-600 shrink-0" />
            <span>
              أنت مسجل كـ <strong>مشرف قسم</strong> على: <strong>{currentUser.assignedDepartment || 'غير محدد'}</strong> (عرض وتقديم بلاغات قسمك فقط).
            </span>
          </div>
        )}

        {/* ========================================================================= */}
        {/* ACTIVE VIEW RENDERING */}
        {/* ========================================================================= */}

        {/* 1. DASHBOARD VIEW */}
        {activeView === 'dashboard' && (
          <DashboardView
            currentUser={currentUser}
            assets={assets}
            tickets={tickets}
            users={users}
            periodicRecords={periodicRecords}
            historyLogs={StorageService.getHistory()}
            onNavigate={(view) => navigateToView(view as ActiveView)}
            onOpenNewTicket={() => {
              setTicketTargetAsset(null);
              navigateToView('tickets');
            }}
            onOpenNewAsset={() => navigateToView('assets')}
            onOpenNewUser={() => navigateToView('users')}
            onOpenImport={() => navigateToView('assets')}
            onManualSync={() => {
              setIsSyncing(true);
              StorageService.triggerManualSync()
                .then(() => reloadData())
                .finally(() => setIsSyncing(false));
            }}
            isSyncing={isSyncing}
          />
        )}

        {/* 2. ASSET MANAGEMENT VIEW */}
        {activeView === 'assets' && (
          <AssetsView
            currentUser={currentUser}
            assets={assets}
            periodicRecords={periodicRecords}
            onRefresh={reloadData}
            onOpenNewTicketForAsset={handleCreateTicketForAsset}
          />
        )}

        {/* 3. MAINTENANCE TICKETS VIEW */}
        {activeView === 'tickets' && (
          <MaintenanceTicketsView
            currentUser={currentUser}
            tickets={tickets}
            assets={assets}
            onRefresh={reloadData}
            openCreateWithAsset={ticketTargetAsset}
            onClearCreateAsset={() => setTicketTargetAsset(null)}
          />
        )}

        {/* 4. PERIODIC MAINTENANCE VIEW */}
        {activeView === 'periodic' && currentUser?.role !== 'supervisor' && (
          <PeriodicMaintenanceView
            currentUser={currentUser}
            assets={assets}
            periodicRecords={periodicRecords}
            onRefresh={reloadData}
          />
        )}

        {/* 5. INVENTORY AUDIT & RECONCILIATION VIEW (Admin & Tech only) */}
        {activeView === 'audit' && (currentUser?.role === 'admin' || currentUser?.role === 'technician') && (
          <AuditView
            currentUser={currentUser}
            assets={assets}
            onRefresh={reloadData}
          />
        )}

        {/* 6. SURGICAL SETS & INSTRUMENTS VIEW */}
        {activeView === 'surgical' && (
          <SurgicalSetsView
            currentUser={currentUser}
            onRefresh={reloadData}
          />
        )}

        {/* 7. USER MANAGEMENT VIEW */}
        {activeView === 'users' && currentUser?.role === 'admin' && (
          <UserManagementView
            currentUser={currentUser}
            users={users}
            assets={assets}
            onRefresh={reloadData}
          />
        )}
      </main>

      {/* ========================================================================= */}
      {/* FOOTER: SYSTEM INFO, COPYRIGHT & DEVELOPER CONTACT */}
      {/* ========================================================================= */}
      <footer className="mt-auto border-t border-slate-200/90 bg-white/95 backdrop-blur-md py-6 text-slate-600 shadow-xs print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
          {/* Rights & System Developer Title */}
          <div className="flex flex-col items-center md:items-start gap-1 text-center md:text-right">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-slate-900 font-bold text-sm">
              <span>إدارة الأصول والهندسة الطبية © 2026</span>
              <span className="text-slate-300">|</span>
              <span className="text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2.5 py-0.5 rounded-full text-[11px] font-semibold">
                جميع الحقوق محفوظة
              </span>
            </div>
            <p className="text-slate-600 text-xs">
              إعداد وتنفيذ: <strong className="text-slate-800 font-bold">المهندس إبراهيم هاشم</strong> • تطوير وإدارة النظام
            </p>
          </div>

          {/* Contact Details */}
          <div className="flex flex-wrap items-center justify-center md:justify-end gap-2.5 text-xs">
            <a
              href="mailto:ibr2hashim@gmail.com"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-blue-50/80 border border-slate-200 hover:border-blue-200 text-slate-700 hover:text-blue-700 transition-all shadow-2xs group"
              dir="ltr"
              title="تواصل عبر البريد الإلكتروني"
            >
              <Mail className="w-3.5 h-3.5 text-blue-600 group-hover:scale-110 transition-transform" />
              <span className="font-medium font-sans">ibr2hashim@gmail.com</span>
            </a>

            <a
              href="tel:+967770288572"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 hover:bg-emerald-50/80 border border-slate-200 hover:border-emerald-200 text-slate-700 hover:text-emerald-700 transition-all shadow-2xs group"
              dir="ltr"
              title="اتصال أو واتساب"
            >
              <Phone className="w-3.5 h-3.5 text-emerald-600 group-hover:scale-110 transition-transform" />
              <span className="font-medium font-sans">+967 770288572</span>
            </a>
          </div>
        </div>
      </footer>

      {/* ========================================================================= */}
      {/* GLOBAL MODALS */}
      {/* ========================================================================= */}

      {/* Data & Backup Management Modal */}
      {showSyncModal && (
        <SyncSettingsModal
          currentUser={currentUser}
          onClose={() => closeAppModal('sync')}
          onRefresh={reloadData}
        />
      )}

      {/* History Log Modal (Admin only) */}
      {showHistoryModal && currentUser?.role === 'admin' && (
        <HistoryModal onClose={() => closeAppModal('history')} />
      )}

      {/* Factory Reset Modal (Admin only) */}
      {showFactoryResetModal && (
        <FactoryResetModal
          onClose={() => closeAppModal('reset')}
          onResetComplete={() => {
            setShowFactoryResetModal(false);
            reloadData();
            navigateToView('dashboard');
          }}
        />
      )}
    </div>
  );
}
