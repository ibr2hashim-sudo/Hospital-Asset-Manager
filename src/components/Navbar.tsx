import React, { useState } from 'react';
import {
  History,
  RotateCcw,
  LogOut,
  Building2,
  Wrench,
  Package,
  Settings,
  ClipboardCheck,
  Scissors,
  Cloud,
  LayoutDashboard,
} from 'lucide-react';
import { SystemSettings, User } from '../types';
import { DEFAULT_SYSTEM_SETTINGS } from '../services/systemSettings';

interface NavbarProps {
  currentUser: User | null;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  onManualSync: () => void;
  onOpenHistory: () => void;
  onOpenReset: () => void;
  onOpenSyncSettings: () => void;
  onOpenPending?: () => void;
  onLogout: () => void;
  ticketPendingCount: number;
  assetsCount?: number;
  usersCount?: number;
  systemSettings?: SystemSettings;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  onOpenHistory,
  onOpenReset,
  onOpenSyncSettings,
  onLogout,
  ticketPendingCount,
  assetsCount = 0,
  systemSettings = DEFAULT_SYSTEM_SETTINGS,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);

  const labels = systemSettings.tabLabels || DEFAULT_SYSTEM_SETTINGS.tabLabels;
  const isCompact = systemSettings.headerDensity === 'compact';

  const getRoleLabel = (role?: string) => {
    switch (role) {
      case 'admin':
        return 'مدير النظام (الأدمن)';
      case 'technician':
        return 'فني الصيانة';
      case 'supervisor':
        return `مشرف قسم (${currentUser?.assignedDepartment || 'غير محدد'})`;
      default:
        return 'مستخدم';
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900 text-white shadow-lg border-b border-slate-800">
      <div className="max-w-[1440px] mx-auto px-3 sm:px-5 lg:px-6">
        <div className={`flex items-center justify-between gap-2 ${isCompact ? 'h-14' : 'h-16'}`}>
          {/* Logo & Main Title */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => setActiveTab('dashboard')}
              className="flex items-center gap-2.5 text-right focus:outline-none group"
            >
              <div
                className={`${
                  isCompact ? 'w-9 h-9' : 'w-10 h-10'
                } rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform overflow-hidden shrink-0`}
              >
                {systemSettings.logoDataUrl ? (
                  <img
                    src={systemSettings.logoDataUrl}
                    alt={systemSettings.systemTitle}
                    className="w-full h-full object-contain bg-white p-0.5"
                  />
                ) : (
                  <Package className="w-5 h-5 text-white" />
                )}
              </div>
              <div className="min-w-0">
                <h1
                  className={`${
                    isCompact ? 'text-sm sm:text-base' : 'text-sm sm:text-base lg:text-lg'
                  } font-bold text-white tracking-wide truncate max-w-[180px] sm:max-w-[240px] xl:max-w-none`}
                >
                  {systemSettings.systemTitle}
                </h1>
                {!isCompact && (
                  <p className="hidden sm:block text-[11px] text-slate-400 font-medium truncate max-w-[240px] xl:max-w-none">
                    {systemSettings.systemSubtitle}
                  </p>
                )}
              </div>
            </button>
          </div>

          {/* Center Navigation Tabs (Desktop - Single Unified Navigation Bar) */}
          <nav className="hidden lg:flex items-center gap-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 overflow-x-auto max-w-full">
            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-2.5 xl:px-3 py-1.5 rounded-lg text-xs xl:text-sm font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'dashboard'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span>{labels.dashboard}</span>
            </button>

            <button
              onClick={() => setActiveTab('assets')}
              className={`px-2.5 xl:px-3 py-1.5 rounded-lg text-xs xl:text-sm font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'assets'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Package className="w-3.5 h-3.5 shrink-0" />
              <span>{labels.assets}</span>
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                  activeTab === 'assets'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {assetsCount}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('tickets')}
              className={`px-2.5 xl:px-3 py-1.5 rounded-lg text-xs xl:text-sm font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap relative ${
                activeTab === 'tickets'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Wrench className="w-3.5 h-3.5 shrink-0" />
              <span>{labels.tickets}</span>
              {(currentUser?.role === 'admin' || currentUser?.role === 'technician') &&
                ticketPendingCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-red-500 text-white font-bold animate-pulse">
                    {ticketPendingCount}
                  </span>
                )}
            </button>

            {/* Periodic Maintenance: Admin and Technician only */}
            {currentUser?.role !== 'supervisor' && (
              <button
                onClick={() => setActiveTab('periodic')}
                className={`px-2.5 xl:px-3 py-1.5 rounded-lg text-xs xl:text-sm font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'periodic'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span>{labels.periodic}</span>
              </button>
            )}

            {/* Inventory Audit: Admin and Technician only */}
            {(currentUser?.role === 'admin' || currentUser?.role === 'technician') && (
              <button
                onClick={() => setActiveTab('audit')}
                className={`px-2.5 xl:px-3 py-1.5 rounded-lg text-xs xl:text-sm font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'audit'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <ClipboardCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{labels.audit}</span>
              </button>
            )}

            {/* Surgical Sets & Trays */}
            <button
              onClick={() => setActiveTab('surgical')}
              className={`px-2.5 xl:px-3 py-1.5 rounded-lg text-xs xl:text-sm font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'surgical'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <Scissors className="w-3.5 h-3.5 text-indigo-300 shrink-0" />
              <span>{labels.surgical}</span>
            </button>

            {/* System Settings & Users: Admin only */}
            {currentUser?.role === 'admin' && (
              <button
                onClick={() => setActiveTab('users')}
                className={`px-2.5 xl:px-3 py-1.5 rounded-lg text-xs xl:text-sm font-semibold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'users'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span>{labels.users}</span>
              </button>
            )}
          </nav>

          {/* Right Controls: Cloud & Data, History, Reset, User Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Cloud & Data Management */}
            <button
              onClick={onOpenSyncSettings}
              title="المزامنة السحابية وإدارة البيانات"
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 hover:text-blue-200 border border-blue-500/30 transition-all text-xs font-bold shadow-xs"
            >
              <Cloud className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden xl:inline">السحابة والبيانات</span>
            </button>

            {/* Admin Extra Tools: History & Factory Reset */}
            {currentUser?.role === 'admin' && (
              <div className="hidden sm:flex items-center gap-1.5 border-r border-slate-700/80 pr-2 mr-0.5">
                <button
                  onClick={onOpenHistory}
                  title="سجل العمليات (History)"
                  className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition-colors"
                >
                  <History className="w-4 h-4" />
                </button>

                <button
                  onClick={onOpenReset}
                  title="إعادة ضبط المصنع (Data Reset)"
                  className="p-2 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-200 border border-red-800/40 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* User Profile & Switch Account Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700/80 transition-colors text-right"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold text-xs">
                  {currentUser?.fullName?.charAt(0) || 'U'}
                </div>
                <div className="hidden 2xl:block">
                  <div className="text-xs font-semibold text-white leading-tight">
                    {currentUser?.fullName}
                  </div>
                  <div className="text-[10px] text-blue-400 font-medium">
                    {getRoleLabel(currentUser?.role)}
                  </div>
                </div>
              </button>

              {/* User Dropdown Menu */}
              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute left-0 mt-2 w-64 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl z-50 p-2 text-right">
                    <div className="p-2.5 border-b border-slate-800 mb-1">
                      <p className="text-xs text-slate-400">الحساب الحالي</p>
                      <p className="text-sm font-bold text-white mt-0.5">
                        {currentUser?.fullName}
                      </p>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-900/60 text-blue-300 border border-blue-700/50">
                        {getRoleLabel(currentUser?.role)}
                      </span>
                    </div>

                    {currentUser?.role === 'admin' && (
                      <>
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            setActiveTab('users');
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 rounded-lg transition-colors text-right"
                        >
                          <Settings className="w-4 h-4 text-indigo-400" />
                          {labels.users} (الهوية والمستخدمين)
                        </button>
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            onOpenHistory();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 rounded-lg transition-colors text-right"
                        >
                          <History className="w-4 h-4 text-slate-400" />
                          سجل العمليات (History)
                        </button>
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            onOpenReset();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-300 hover:bg-red-950/50 rounded-lg transition-colors text-right"
                        >
                          <RotateCcw className="w-4 h-4 text-red-400" />
                          إعادة ضبط المصنع (Data Reset)
                        </button>
                      </>
                    )}

                    <div className="border-t border-slate-800 my-1 pt-1">
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onLogout();
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-300 hover:bg-amber-950/40 rounded-lg transition-colors text-right"
                      >
                        <LogOut className="w-4 h-4 text-amber-400" />
                        تسجيل الخروج
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Sub-Navigation Bar */}
        <div className="lg:hidden flex items-center gap-1 py-2 border-t border-slate-800 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap ${
              activeTab === 'dashboard' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            {labels.dashboard}
          </button>
          <button
            onClick={() => setActiveTab('assets')}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap flex items-center gap-1 ${
              activeTab === 'assets' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            <span>{labels.assets}</span>
            <span className="text-[10px] opacity-80 font-mono">({assetsCount})</span>
          </button>
          <button
            onClick={() => setActiveTab('tickets')}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap relative flex items-center gap-1 ${
              activeTab === 'tickets' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            <span>{labels.tickets}</span>
            {(currentUser?.role === 'admin' || currentUser?.role === 'technician') &&
              ticketPendingCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-red-500 text-white font-bold">
                  {ticketPendingCount}
                </span>
              )}
          </button>
          {currentUser?.role !== 'supervisor' && (
            <button
              onClick={() => setActiveTab('periodic')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap ${
                activeTab === 'periodic' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              {labels.periodic}
            </button>
          )}
          {(currentUser?.role === 'admin' || currentUser?.role === 'technician') && (
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap ${
                activeTab === 'audit' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              {labels.audit}
            </button>
          )}
          <button
            onClick={() => setActiveTab('surgical')}
            className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap ${
              activeTab === 'surgical' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
            }`}
          >
            {labels.surgical}
          </button>
          {currentUser?.role === 'admin' && (
            <button
              onClick={() => setActiveTab('users')}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap ${
                activeTab === 'users' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              {labels.users}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

