import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Users as UsersIcon,
  Plus,
  Shield,
  Wrench,
  Building2,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  X,
  AlertTriangle,
  RefreshCw,
  Cloud,
  Settings,
  ChevronDown,
  ChevronUp,
  Palette,
  Type,
  Image as ImageIcon,
  Upload,
  RotateCcw,
  Save,
  Package,
  Layout,
} from 'lucide-react';
import {
  User,
  UserRole,
  Asset,
  SystemSettings,
  SystemFontFamily,
  SystemFontSizeScale,
  NavTabLabels,
} from '../types';
import { StorageService } from '../services/storage';
import { FirestoreSyncService } from '../services/firestoreSync';
import {
  DEFAULT_SYSTEM_SETTINGS,
  SYSTEM_FONT_OPTIONS,
  SystemSettingsService,
} from '../services/systemSettings';

interface UserManagementViewProps {
  currentUser: User | null;
  users?: User[];
  assets?: Asset[];
  onRefresh: () => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  currentUser,
  users = [],
  assets = [],
  onRefresh,
}) => {
  // Collapsible Sections (أقسام منسدلة)
  const [openPageSettings, setOpenPageSettings] = useState(true);
  const [openUsersSection, setOpenUsersSection] = useState(true);

  // Page & Branding Settings State
  const [draftSettings, setDraftSettings] = useState<SystemSettings>(() =>
    SystemSettingsService.getSettings()
  );
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isPullingSettings, setIsPullingSettings] = useState(false);
  const [settingsMsg, setSettingsMsg] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Users Management State
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deleteConfirmUser, setDeleteConfirmUser] = useState<User | null>(null);
  const [isSyncingUsers, setIsSyncingUsers] = useState(false);
  const [syncMsg, setSyncMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    const onSettingsUpdated = () => {
      setDraftSettings(SystemSettingsService.getSettings());
    };
    window.addEventListener('system-settings-updated', onSettingsUpdated);
    return () => window.removeEventListener('system-settings-updated', onSettingsUpdated);
  }, []);

  const safeUsers = useMemo(() => (Array.isArray(users) ? users : []), [users]);
  const safeAssets = useMemo(() => (Array.isArray(assets) ? assets : []), [assets]);

  // Departments list to assign to supervisors
  const departmentsList = useMemo(() => {
    return (
      Array.from(new Set(safeAssets.map((a) => a.mainDepartment).filter(Boolean))) as string[]
    ).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [safeAssets]);

  const activeCount = safeUsers.filter((u) => u.isActive !== false).length;

  // Handle Logo Upload
  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressedDataUrl = await SystemSettingsService.compressLogoFile(file);
      setDraftSettings((prev) => ({ ...prev, logoDataUrl: compressedDataUrl }));
      setSettingsMsg({
        text: 'تم تجهيز الشعار الجديد. اضغط "حفظ وتطبيق الإعدادات" لاعتماده ومزامنته.',
        type: 'info',
      });
    } catch (err: any) {
      setSettingsMsg({
        text: err?.message || 'تعذر تحميل صورة الشعار',
        type: 'error',
      });
    } finally {
      e.target.value = '';
    }
  };

  // Save & Sync Page Settings
  const handleSaveSystemSettings = async () => {
    setIsSavingSettings(true);
    setSettingsMsg(null);
    try {
      const saved = SystemSettingsService.saveSettingsLocal(draftSettings);
      setDraftSettings(saved);
      const res = await FirestoreSyncService.syncSystemSettings(saved);
      setSettingsMsg({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
      onRefresh();
    } catch (err: any) {
      setSettingsMsg({
        text: err?.message || 'حدث خطأ أثناء حفظ الإعدادات',
        type: 'error',
      });
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Pull Page Settings from Cloud
  const handlePullSystemSettings = async () => {
    setIsPullingSettings(true);
    setSettingsMsg(null);
    try {
      const res = await FirestoreSyncService.syncSystemSettingsFromCloud();
      setDraftSettings(SystemSettingsService.getSettings());
      setSettingsMsg({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
      onRefresh();
    } catch (err: any) {
      setSettingsMsg({
        text: err?.message || 'تعذر جلب الإعدادات من السحابة',
        type: 'error',
      });
    } finally {
      setIsPullingSettings(false);
    }
  };

  // Reset Page Settings to Default
  const handleResetDefaultSettings = () => {
    const defaultsCopy: SystemSettings = {
      ...DEFAULT_SYSTEM_SETTINGS,
      tabLabels: { ...DEFAULT_SYSTEM_SETTINGS.tabLabels },
    };
    setDraftSettings(defaultsCopy);
    SystemSettingsService.saveSettingsLocal(defaultsCopy);
    setSettingsMsg({
      text: 'تمت استعادة الإعدادات الافتراضية محلياً. اضغط "حفظ وتطبيق" إذا أردت اعتمادها في السحابة أيضاً.',
      type: 'info',
    });
  };

  const updateTabLabel = (key: keyof NavTabLabels, val: string) => {
    setDraftSettings((prev) => ({
      ...prev,
      tabLabels: {
        ...prev.tabLabels,
        [key]: val,
      },
    }));
  };

  const handleSyncUsersWithCloud = async () => {
    if (isSyncingUsers) return;
    setIsSyncingUsers(true);
    setSyncMsg(null);
    try {
      const pushRes = await FirestoreSyncService.pushAllLocalDataToFirestore();
      const pullRes = await FirestoreSyncService.syncUsersFromCloud();
      onRefresh();
      if (pullRes.success) {
        setSyncMsg({
          text: pullRes.message,
          type: 'success',
        });
      } else {
        setSyncMsg({
          text: pullRes.message || pushRes.message,
          type: 'error',
        });
      }
    } catch (err: any) {
      setSyncMsg({
        text: err?.message || 'حدث خطأ أثناء مزامنة المستخدمين مع السحابة',
        type: 'error',
      });
    } finally {
      setIsSyncingUsers(false);
    }
  };

  const getRoleBadge = (role: UserRole) => {
    switch (role) {
      case 'admin':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 flex items-center gap-1">
            <Shield className="w-3.5 h-3.5" />
            أدمن (صلاحية كاملة)
          </span>
        );
      case 'technician':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
            <Wrench className="w-3.5 h-3.5" />
            فني صيانة
          </span>
        );
      case 'supervisor':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 flex items-center gap-1">
            <Building2 className="w-3.5 h-3.5" />
            مشرف قسم
          </span>
        );
    }
  };

  const handleDeleteUser = () => {
    if (!deleteConfirmUser) return;
    try {
      StorageService.deleteUser(deleteConfirmUser.id);
      setDeleteConfirmUser(null);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'تعذر حذف المستخدم');
    }
  };

  const tabFields: Array<{ key: keyof NavTabLabels; title: string; placeholder: string }> = [
    { key: 'dashboard', title: 'نافذة الرئيسية', placeholder: 'الرئيسية' },
    { key: 'assets', title: 'نافذة العهد والأصول', placeholder: 'العهد والأصول' },
    { key: 'tickets', title: 'نافذة طلبات الصيانة', placeholder: 'طلبات الصيانة' },
    { key: 'periodic', title: 'نافذة الصيانة الدورية', placeholder: 'الصيانة الدورية' },
    { key: 'audit', title: 'نافذة الجرد والمطابقة', placeholder: 'الجرد والمطابقة' },
    { key: 'surgical', title: 'نافذة الأدوات الجراحية', placeholder: 'الأدوات الجراحية' },
    { key: 'users', title: 'نافذة الإعدادات والمستخدمين', placeholder: 'الإعدادات' },
  ];

  return (
    <div className="space-y-5">
      {/* Unified Settings Page Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-blue-600 text-white flex items-center justify-center shadow-md shadow-indigo-500/20">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg sm:text-xl font-black text-slate-900">
              إعدادات النظام وإدارة المستخدمين
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              تخصيص شعار النظام وأسماء النوافذ والخطوط والتنسيق، وإدارة حسابات المستخدمين والصلاحيات من مكان واحد.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setOpenPageSettings((v) => !v)}
            className={`px-3 py-1.5 rounded-xl font-bold border transition-all ${
              openPageSettings
                ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            إعدادات الصفحة
          </button>
          <button
            type="button"
            onClick={() => setOpenUsersSection((v) => !v)}
            className={`px-3 py-1.5 rounded-xl font-bold border transition-all ${
              openUsersSection
                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            المستخدمين ({activeCount})
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* COLLAPSIBLE SECTION 1: PAGE, BRANDING, FONT & LAYOUT SETTINGS */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setOpenPageSettings((prev) => !prev)}
          className="w-full p-5 flex items-center justify-between gap-4 text-right hover:bg-slate-50/70 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
              <Palette className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                قسم إعدادات الصفحة والهوية والخطوط
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                تغيير الشعار، اسم النظام، أسماء نوافذ النظام، ونوع وحجم الخط والتنسيق العام
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden sm:inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-[11px] font-bold">
              {openPageSettings ? 'إخفاء القسم' : 'فتح القسم'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
              {openPageSettings ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </div>
          </div>
        </button>

        {openPageSettings && (
          <div className="p-5 pt-2 border-t border-slate-100 space-y-6">
            {settingsMsg && (
              <div
                className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
                  settingsMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : settingsMsg.type === 'error'
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : 'bg-blue-50 border-blue-200 text-blue-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {settingsMsg.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : settingsMsg.type === 'error' ? (
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  ) : (
                    <Cloud className="w-4 h-4 text-blue-600 shrink-0" />
                  )}
                  <span>{settingsMsg.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsMsg(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Live Header Preview */}
            <div className="rounded-2xl bg-slate-900 text-white p-4 border border-slate-800 space-y-2">
              <div className="text-[11px] text-slate-400 font-semibold">
                معاينة حية لشكل الشعار والعنوان والخط المختار:
              </div>
              <div
                className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/70 border border-slate-700/70"
                style={{ fontFamily: `'${draftSettings.fontFamily}', sans-serif` }}
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center overflow-hidden shrink-0 shadow">
                  {draftSettings.logoDataUrl ? (
                    <img
                      src={draftSettings.logoDataUrl}
                      alt="Preview Logo"
                      className="w-full h-full object-contain bg-white p-0.5"
                    />
                  ) : (
                    <Package className="w-6 h-6 text-white" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-base font-bold text-white truncate">
                    {draftSettings.systemTitle || DEFAULT_SYSTEM_SETTINGS.systemTitle}
                  </div>
                  <div className="text-xs text-slate-300 truncate">
                    {draftSettings.systemSubtitle || DEFAULT_SYSTEM_SETTINGS.systemSubtitle}
                  </div>
                </div>
              </div>
            </div>

            {/* 1. Logo & System Name */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Logo Control */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                  <ImageIcon className="w-4 h-4 text-blue-600" />
                  <span>شعار النظام (Logo)</span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-2xl bg-white border border-slate-300 flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                    {draftSettings.logoDataUrl ? (
                      <img
                        src={draftSettings.logoDataUrl}
                        alt="System Logo"
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <Package className="w-7 h-7 text-slate-400" />
                    )}
                  </div>

                  <div className="space-y-2 flex-1">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      onChange={handleLogoUpload}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      رفع شعار جديد
                    </button>

                    {draftSettings.logoDataUrl && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraftSettings((prev) => ({ ...prev, logoDataUrl: '' }))
                        }
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 text-[11px] font-bold transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        استعادة الأيقونة الافتراضية
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  يظهر الشعار في الشريط العلوي، شاشة تسجيل الدخول، وترويسة محاضر الجرد والتقارير المطبوعة.
                </p>
              </div>

              {/* System Title & Subtitle */}
              <div className="lg:col-span-2 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                  <Layout className="w-4 h-4 text-indigo-600" />
                  <span>اسم النظام والعنوان الفرعي</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      الاسم الرئيسي للنظام:
                    </label>
                    <input
                      type="text"
                      value={draftSettings.systemTitle}
                      onChange={(e) =>
                        setDraftSettings((prev) => ({ ...prev, systemTitle: e.target.value }))
                      }
                      placeholder={DEFAULT_SYSTEM_SETTINGS.systemTitle}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      الوصف الفرعي (أسفل العنوان):
                    </label>
                    <input
                      type="text"
                      value={draftSettings.systemSubtitle}
                      onChange={(e) =>
                        setDraftSettings((prev) => ({ ...prev, systemSubtitle: e.target.value }))
                      }
                      placeholder={DEFAULT_SYSTEM_SETTINGS.systemSubtitle}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white font-medium text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Font & Layout Formatting */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex items-center gap-2 text-xs font-black text-slate-800">
                <Type className="w-4 h-4 text-emerald-600" />
                <span>الخطوط والتنسيق العام</span>
              </div>

              {/* Font Family Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {SYSTEM_FONT_OPTIONS.map((opt) => {
                  const selected = draftSettings.fontFamily === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        setDraftSettings((prev) => ({
                          ...prev,
                          fontFamily: opt.value as SystemFontFamily,
                        }))
                      }
                      style={{ fontFamily: `'${opt.value}', sans-serif` }}
                      className={`p-3 rounded-xl border text-right transition-all ${
                        selected
                          ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-600/20'
                          : 'bg-white text-slate-800 border-slate-200 hover:border-blue-300 hover:bg-blue-50/40'
                      }`}
                    >
                      <div className="text-xs font-black">{opt.label}</div>
                      <div
                        className={`text-[11px] mt-1 leading-snug ${
                          selected ? 'text-blue-100' : 'text-slate-500'
                        }`}
                      >
                        نموذج: إدارة الأصول 123
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Size Scale & Header Density */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    حجم الخط العام للواجهة:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'compact', label: 'مضغوط (صغير)' },
                        { id: 'normal', label: 'قياسي (متوسط)' },
                        { id: 'comfortable', label: 'مريح (كبير)' },
                      ] as Array<{ id: SystemFontSizeScale; label: string }>
                    ).map((sz) => (
                      <button
                        key={sz.id}
                        type="button"
                        onClick={() =>
                          setDraftSettings((prev) => ({ ...prev, fontSizeScale: sz.id }))
                        }
                        className={`py-2 px-2 rounded-xl border font-bold text-center transition-all ${
                          draftSettings.fontSizeScale === sz.id
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {sz.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">
                    تنسيق الشريط العلوي (الهيدر):
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setDraftSettings((prev) => ({ ...prev, headerDensity: 'normal' }))
                      }
                      className={`py-2 px-3 rounded-xl border font-bold text-center transition-all ${
                        draftSettings.headerDensity === 'normal'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      قياسي (مع الوصف الفرعي)
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftSettings((prev) => ({ ...prev, headerDensity: 'compact' }))
                      }
                      className={`py-2 px-3 rounded-xl border font-bold text-center transition-all ${
                        draftSettings.headerDensity === 'compact'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      مضغوط (مساحة محتوى أكبر)
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Custom Tab / Window Names */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-slate-800">
                  تخصيص أسماء نوافذ النظام (التبويبات العلوية):
                </span>
                <span className="text-[11px] text-slate-500">
                  يمكنك تعديل اسم أي نافذة بما يناسب نظام عملك
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                {tabFields.map((tf) => (
                  <div key={tf.key}>
                    <label className="block font-bold text-slate-600 mb-1">{tf.title}:</label>
                    <input
                      type="text"
                      value={draftSettings.tabLabels[tf.key] || ''}
                      onChange={(e) => updateTabLabel(tf.key, e.target.value)}
                      placeholder={tf.placeholder}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Settings Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetDefaultSettings}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  استعادة الافتراضي
                </button>

                <button
                  type="button"
                  onClick={handlePullSystemSettings}
                  disabled={isPullingSettings}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPullingSettings ? 'animate-spin' : ''}`} />
                  {isPullingSettings ? 'جاري الجلب...' : 'جلب الإعدادات من السحابة'}
                </button>
              </div>

              <button
                type="button"
                onClick={handleSaveSystemSettings}
                disabled={isSavingSettings}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all disabled:opacity-50"
              >
                {isSavingSettings ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {isSavingSettings ? 'جاري الحفظ والمزامنة...' : 'حفظ وتطبيق الإعدادات (ومزامنتها سحابياً)'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* COLLAPSIBLE SECTION 2: USER MANAGEMENT & PERMISSIONS */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        <div
          onClick={() => setOpenUsersSection((prev) => !prev)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setOpenUsersSection((prev) => !prev);
            }
          }}
          className="w-full p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 text-right hover:bg-slate-50/70 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
              <UsersIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900">
                قسم إدارة المستخدمين والصلاحيات ({activeCount} نشط)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                التحكم في حسابات الأدمن، الفنيين، ومشرفي الأقسام وتخصيص الأقسام والصلاحيات بدقة.
              </p>
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={handleSyncUsersWithCloud}
              disabled={isSyncingUsers}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingUsers ? 'animate-spin' : ''}`} />
              {isSyncingUsers ? 'جاري المزامنة...' : 'مزامنة المستخدمين مع السحابة'}
            </button>

            <button
              type="button"
              onClick={() => {
                setEditingUser(null);
                setShowAddModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              إضافة مستخدم جديد
            </button>

            <button
              type="button"
              onClick={() => setOpenUsersSection((prev) => !prev)}
              className="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center hover:bg-slate-200 transition-colors"
              title={openUsersSection ? 'طي القسم' : 'فتح القسم'}
            >
              {openUsersSection ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {openUsersSection && (
          <div className="p-5 pt-2 border-t border-slate-100 space-y-5">
            {syncMsg && (
              <div
                className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between gap-3 ${
                  syncMsg.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border-red-200 text-red-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {syncMsg.type === 'success' ? (
                    <Cloud className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{syncMsg.text}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSyncMsg(null)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Role Explanations Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-200 space-y-1.5">
                <div className="flex items-center gap-2 text-blue-900 font-bold text-xs">
                  <Shield className="w-4 h-4 text-blue-600" />
                  الأدمن (Admin)
                </div>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  صلاحية كاملة: إضافة وتعديل ومسح الأجهزة والأقسام، إدارة المستخدمين والإعدادات، استيراد وتصدير Excel، والاطلاع على السجل وإعادة الضبط.
                </p>
                <div className="text-[10px] text-blue-600 font-mono pt-1">
                  الحساب الافتراضي: Admin / MAINADMIN
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
                  <Wrench className="w-4 h-4 text-amber-600" />
                  فني الصيانة (Technician)
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  الاطلاع على جميع الأجهزة، استلام طلبات الصيانة وإدارتها، تسجيل التقارير الفنية وقطع الغيار، وإدارة ومتابعة الصيانة الدورية.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200 space-y-1.5">
                <div className="flex items-center gap-2 text-purple-900 font-bold text-xs">
                  <Building2 className="w-4 h-4 text-purple-600" />
                  مشرف القسم (Supervisor)
                </div>
                <p className="text-[11px] text-purple-800 leading-relaxed">
                  صلاحية مقتصرة على القسم المحدد فقط (لا يرى الأقسام الأخرى)، وإمكانية تقديم بلاغات صيانة لأجهزة قسمه حصرياً.
                </p>
              </div>
            </div>

            {/* Users Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
                <h4 className="text-sm font-bold text-slate-800">
                  قائمة مستخدمي النظام ({activeCount} نشط)
                </h4>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-slate-700 font-bold">
                    <tr>
                      <th className="p-3.5">الاسم والصفة</th>
                      <th className="p-3.5">اسم المستخدم</th>
                      <th className="p-3.5">الدور والصلاحية</th>
                      <th className="p-3.5">القسم المعين</th>
                      <th className="p-3.5">الحالة</th>
                      <th className="p-3.5 text-left">الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="p-3.5 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-xs">
                              {u.fullName.charAt(0)}
                            </div>
                            <span>{u.fullName}</span>
                            {u.id === currentUser?.id && (
                              <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-normal">
                                أنت
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3.5 font-mono text-slate-700 font-semibold">{u.username}</td>
                        <td className="p-3.5">{getRoleBadge(u.role)}</td>
                        <td className="p-3.5">
                          {u.role === 'supervisor' ? (
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold">
                              {u.assignedDepartment || 'غير محدد'}
                            </span>
                          ) : (
                            <span className="text-slate-400">كافة الأقسام</span>
                          )}
                        </td>
                        <td className="p-3.5">
                          {u.isActive !== false ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              نشط
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-slate-400">
                              <XCircle className="w-3.5 h-3.5" />
                              معطل
                            </span>
                          )}
                        </td>
                        <td className="p-3.5 text-left">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setEditingUser(u);
                                setShowAddModal(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                              title="تعديل المستخدم"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            {u.username.toLowerCase() !== 'admin' && (
                              <button
                                onClick={() => setDeleteConfirmUser(u)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                                title="حذف المستخدم"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL: ADD / EDIT USER */}
      {/* ========================================================================= */}
      {showAddModal && (
        <AddEditUserModal
          user={editingUser}
          departmentsList={departmentsList}
          onClose={() => {
            setShowAddModal(false);
            setEditingUser(null);
          }}
          onSaved={() => {
            setShowAddModal(false);
            setEditingUser(null);
            onRefresh();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* MODAL: CONFIRM DELETE USER */}
      {/* ========================================================================= */}
      {deleteConfirmUser && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">تأكيد حذف المستخدم</h3>
              <p className="text-xs text-slate-500 mt-1">
                هل أنت متأكد من حذف الحساب (
                <span className="font-bold text-slate-800">{deleteConfirmUser.fullName}</span> -{' '}
                <span className="font-mono text-slate-800">{deleteConfirmUser.username}</span>)؟
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setDeleteConfirmUser(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                إلغاء
              </button>
              <button
                onClick={handleDeleteUser}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-700 text-white shadow"
              >
                تأكيد الحذف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// =========================================================================
// SUB-COMPONENT: ADD / EDIT USER MODAL
// =========================================================================
interface AddEditUserModalProps {
  user: User | null;
  departmentsList: string[];
  onClose: () => void;
  onSaved: () => void;
}

const AddEditUserModal: React.FC<AddEditUserModalProps> = ({
  user,
  departmentsList,
  onClose,
  onSaved,
}) => {
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [username, setUsername] = useState(user?.username || '');
  const [password, setPassword] = useState(user?.password || '');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>(user?.role || 'technician');
  const [assignedDepartment, setAssignedDepartment] = useState(user?.assignedDepartment || '');
  const [customDeptInput, setCustomDeptInput] = useState('');
  const [isActive, setIsActive] = useState(user?.isActive !== false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!username.trim() || !fullName.trim()) {
      setErrorMsg('اسم المستخدم والاسم الكامل مطلوبان');
      return;
    }

    if (!user && !password.trim()) {
      setErrorMsg('كلمة المرور مطلوبة للمستخدم الجديد');
      return;
    }

    const finalDept = customDeptInput.trim() || assignedDepartment.trim();

    if (role === 'supervisor' && !finalDept) {
      setErrorMsg('يجب تعيين قسم محدد لمشرف القسم');
      return;
    }

    try {
      StorageService.saveUser({
        id: user?.id,
        fullName: fullName.trim(),
        username: username.trim(),
        password: password.trim() || user?.password || '123456',
        role,
        assignedDepartment: role === 'supervisor' ? finalDept : undefined,
        isActive,
      });

      onSaved();
    } catch (err: any) {
      setErrorMsg(err.message || 'حدث خطأ أثناء حفظ المستخدم');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-right">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <UsersIcon className="w-5 h-5 text-indigo-600" />
            {user ? 'تعديل بيانات المستخدم' : 'إضافة مستخدم جديد للنظام'}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs font-bold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              الاسم الكامل / المسمى الوظيفي: <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="مثال: م. أحمد عبد الله"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 mb-1">
              اسم المستخدم (Username): <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="مثال: ahmed_tech"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          {/* Password field with show/hide icon */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              كلمة المرور: {user && <span className="text-slate-400 font-normal">(اتركها كما هي إذا لم ترغب في التغيير)</span>}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={user ? '••••••••' : 'أدخل كلمة المرور'}
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-300 font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none"
                title={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Role Selection */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              صلاحية ودور المستخدم: <span className="text-red-500">*</span>
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-bold"
            >
              <option value="admin">الأدمن (Admin) - صلاحية كاملة وإدارة النظام</option>
              <option value="technician">فني صيانة (Technician) - استلام وإدارة البلاغات والدورية</option>
              <option value="supervisor">مشرف قسم (Department Supervisor) - قسم محدد فقط</option>
            </select>
          </div>

          {/* If Role is Supervisor: Assign Department */}
          {role === 'supervisor' && (
            <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-xl space-y-2">
              <label className="block font-bold text-purple-900 text-xs">
                تعيين القسم الخاص بالمشرف: <span className="text-red-500">*</span>
              </label>

              {departmentsList.length > 0 && (
                <select
                  value={assignedDepartment}
                  onChange={(e) => {
                    setAssignedDepartment(e.target.value);
                    setCustomDeptInput('');
                  }}
                  className="w-full p-2 rounded-lg border border-purple-300 text-xs font-semibold bg-white"
                >
                  <option value="">— اختر من الأقسام المسجلة —</option>
                  {departmentsList.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              )}

              <div>
                <span className="text-[11px] text-purple-700 block mb-1">أو اكتب اسم قسم جديد:</span>
                <input
                  type="text"
                  value={customDeptInput}
                  onChange={(e) => {
                    setCustomDeptInput(e.target.value);
                    setAssignedDepartment('');
                  }}
                  placeholder="مثال: قسم العناية المركزة (ICU)"
                  className="w-full p-2 rounded-lg border border-purple-300 text-xs bg-white"
                />
              </div>
            </div>
          )}

          {/* Status Checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="user-active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded"
            />
            <label htmlFor="user-active" className="font-semibold text-slate-700">
              حساب نشط (يمكنه تسجيل الدخول واستخدام النظام)
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100"
            >
              إلغاء
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20"
            >
              {user ? 'حفظ التعديلات' : 'إضافة المستخدم'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
