import React, { useState, useRef } from 'react';
import {
  Download,
  Upload,
  X,
  FileSpreadsheet,
  Database,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  FileJson,
  RefreshCw,
  Cloud,
  Image as ImageIcon,
} from 'lucide-react';
import { FirestoreSyncService } from '../services/firestoreSync';
import { StorageService } from '../services/storage';
import { SurgicalStorageService } from '../services/surgicalStorage';
import { ExcelUtils } from '../utils/excelImportExport';
import { User } from '../types';

interface SyncSettingsModalProps {
  currentUser?: User | null;
  onClose: () => void;
  onRefresh: () => void;
}

export const SyncSettingsModal: React.FC<SyncSettingsModalProps> = ({
  currentUser,
  onClose,
  onRefresh,
}) => {
  const isAdmin = currentUser?.role === 'admin';

  // Cloud sync states
  const [isPushingCloud, setIsPushingCloud] = useState(false);
  const [isPullingCloud, setIsPullingCloud] = useState(false);
  const [isUploadingImages, setIsUploadingImages] = useState(false);
  const [imageProgress, setImageProgress] = useState<{ current: number; total: number; key: string } | null>(null);

  // Backup states
  const [isExportingBackup, setIsExportingBackup] = useState(false);
  const [isImportingBackup, setIsImportingBackup] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // File Inputs
  const excelComprehensiveInputRef = useRef<HTMLInputElement>(null);
  const fullBackupInputRef = useRef<HTMLInputElement>(null);

  // 1. Push all local DATA only to User's Firebase (Blue Button)
  const handlePushDataOnlyToCloud = async () => {
    setIsPushingCloud(true);
    setStatusMsg({ text: 'جاري رفع ومزامنة البيانات النصية فقط إلى قاعدة بياناتك السحابية...', type: 'info' });
    try {
      const res = await FirestoreSyncService.pushAllLocalDataToFirestore();
      setStatusMsg({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
      if (res.success) {
        onRefresh();
      }
    } catch (err: any) {
      setStatusMsg({
        text: `فشل رفع البيانات: ${err?.message || 'خطأ غير متوقع'}`,
        type: 'error',
      });
    } finally {
      setIsPushingCloud(false);
    }
  };

  // 2. Pull all cloud DATA only from User's Firebase (Green Button)
  const handlePullDataOnlyFromCloud = async () => {
    setIsPullingCloud(true);
    setStatusMsg({ text: 'جاري تنزيل وتحديث كافة البيانات النصية بسرعة فائقة من سحابتك...', type: 'info' });
    try {
      const res = await FirestoreSyncService.pullAllCloudDataToLocal();
      setStatusMsg({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
      if (res.success) {
        onRefresh();
      }
    } catch (err: any) {
      setStatusMsg({
        text: `فشل جلب البيانات: ${err?.message || 'خطأ غير متوقع'}`,
        type: 'error',
      });
    } finally {
      setIsPullingCloud(false);
    }
  };

  // 3. Upload IMAGES only to Cloud (Orange Button)
  const handleUploadImagesOnly = async () => {
    setIsUploadingImages(true);
    setImageProgress(null);
    setStatusMsg({ text: 'جاري فحص ورفع كافة صور الأجهزة من الذاكرة المحلية إلى السحابة...', type: 'info' });
    try {
      const res = await FirestoreSyncService.uploadAllImagesToCloud((current, total, key) => {
        setImageProgress({ current, total, key });
      });
      setStatusMsg({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
      if (res.success) {
        onRefresh();
      }
    } catch (err: any) {
      setStatusMsg({
        text: `فشل رفع الصور: ${err?.message || 'خطأ غير متوقع'}`,
        type: 'error',
      });
    } finally {
      setIsUploadingImages(false);
      setImageProgress(null);
    }
  };

  // 4. Export Complete Backup (Data + Images JSON)
  const handleExportFullBackup = async () => {
    setIsExportingBackup(true);
    setStatusMsg({ text: 'جاري جمع وضغط كافة البيانات وسجلات الأصول وجميع الصور من ذاكرة المتصفح...', type: 'info' });
    try {
      const backupJsonString = await StorageService.exportCompleteDatabaseBackup();
      const blob = new Blob([backupJsonString], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const now = new Date().toISOString().split('T')[0];
      link.href = url;
      link.setAttribute('download', `AssetSync_Full_Backup_${now}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setStatusMsg({
        text: 'تم إنشاء وتنزيل النسخة الاحتياطية الشاملة بنجاح (تشمل كافة البيانات وجداول الصيانة وجميع الصور بدقة عالية).',
        type: 'success',
      });
    } catch (err: any) {
      setStatusMsg({
        text: `فشل تصدير النسخة الاحتياطية: ${err?.message || 'حدث خطأ غير متوقع'}`,
        type: 'error',
      });
    } finally {
      setIsExportingBackup(false);
    }
  };

  // 5. Import Complete Backup (Data + Images JSON)
  const handleImportFullBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('تحذير: استعادة النسخة الاحتياطية الشاملة ستعمل على تحديث وإدراج كافة البيانات والصور من الملف إلى المتصفح الحالي. هل تود المتابعة؟')) {
      if (fullBackupInputRef.current) fullBackupInputRef.current.value = '';
      return;
    }

    setIsImportingBackup(true);
    setStatusMsg({ text: 'جاري قراءة واستعادة ملف النسخة الاحتياطية والصور...', type: 'info' });

    try {
      const fileText = await file.text();
      const res = await StorageService.importCompleteDatabaseBackup(fileText);
      setStatusMsg({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
      if (res.success) {
        onRefresh();
      }
    } catch (err: any) {
      setStatusMsg({
        text: `فشل استعادة النسخة الاحتياطية: ${err?.message || 'ملف غير صالح'}`,
        type: 'error',
      });
    } finally {
      setIsImportingBackup(false);
      if (fullBackupInputRef.current) {
        fullBackupInputRef.current.value = '';
      }
    }
  };

  // 6. Export Comprehensive Excel
  const handleExportComprehensiveExcel = () => {
    try {
      const users = StorageService.getUsers();
      const assets = StorageService.getAssets();
      const tickets = StorageService.getTickets();
      const periodicRecords = StorageService.getPeriodicRecords();
      const history = StorageService.getHistory();
      const surgicalSets = SurgicalStorageService.getSets();
      const surgicalInstruments = SurgicalStorageService.getInstruments();

      ExcelUtils.exportComprehensiveDatabaseToXLSX({
        users,
        assets,
        tickets,
        periodicRecords,
        history,
        surgicalSets,
        surgicalInstruments,
      });

      setStatusMsg({
        text: 'تم إنشاء وتنزيل ملف Excel الشامل (يشمل الأصول، الصيانة، والسيتات الجراحية) بنجاح.',
        type: 'success',
      });
    } catch (err: any) {
      setStatusMsg({
        text: `فشل تصدير ملف Excel: ${err?.message || 'حدث خطأ'}`,
        type: 'error',
      });
    }
  };

  // 7. Import Comprehensive Excel
  const handleImportComprehensiveExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatusMsg({ text: 'جاري قراءة ومعالجة ملف Excel الشامل...', type: 'info' });

    try {
      const existingAssets = StorageService.getAssets();
      const result = await ExcelUtils.parseExcelOrCSV(file, existingAssets);

      if (result.successCount > 0 || (result.importedAssets && result.importedAssets.length > 0)) {
        StorageService.batchImportComprehensiveData({
          assets: result.importedAssets,
          users: result.importedUsers,
          tickets: result.importedTickets,
          periodicRecords: result.importedPeriodic,
        });

        setStatusMsg({
          text: `تم استيراد بيانات ملف Excel بنجاح (${result.successCount} سجل).`,
          type: 'success',
        });
        onRefresh();
      } else {
        setStatusMsg({
          text: `لم يتم استيراد بيانات من الملف: ${result.errors.join(' - ') || 'الملف فارغ أو غير متطابق'}`,
          type: 'error',
        });
      }
    } catch (err: any) {
      setStatusMsg({
        text: `فشل استيراد ملف Excel: ${err?.message || 'حدث خطأ غير متوقع'}`,
        type: 'error',
      });
    } finally {
      if (excelComprehensiveInputRef.current) {
        excelComprehensiveInputRef.current.value = '';
      }
    }
  };

  const projectId = FirestoreSyncService.getProjectId();

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 text-right border border-slate-100 animate-in fade-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Cloud className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>المزامنة وإدارة البيانات</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold border border-emerald-200">
                  متصل بـ Firebase 🟢
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                مشروعك: {projectId}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Status Alert */}
        {statusMsg && (
          <div
            className={`p-3.5 rounded-2xl text-xs font-bold flex items-center gap-2 border ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : statusMsg.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-200'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : statusMsg.type === 'error' ? (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            ) : (
              <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Upload Progress for Images */}
        {isUploadingImages && imageProgress && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-2xl space-y-1.5 text-xs text-orange-950 font-bold">
            <div className="flex items-center justify-between text-[11px]">
              <span>جاري رفع الصور للسحابة:</span>
              <span className="font-mono text-orange-700">
                {imageProgress.current} من {imageProgress.total} ({Math.round((imageProgress.current / imageProgress.total) * 100)}%)
              </span>
            </div>
            <div className="w-full bg-orange-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-orange-600 h-full transition-all duration-200"
                style={{ width: `${Math.round((imageProgress.current / imageProgress.total) * 100)}%` }}
              />
            </div>
            <div className="text-[10px] text-orange-600 truncate font-mono">
              الصورة الحالية: {imageProgress.key}
            </div>
          </div>
        )}

        {/* Section 1: User's Private Firebase Cloud (3 Specific Buttons) */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50/80 via-slate-50 to-indigo-50/40 border border-blue-100/90 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Database className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  المزامنة السحابية الذكية (Firebase Firestore)
                </h4>
                <p className="text-[11px] text-slate-500">
                  فصل رفع وتحديث البيانات النصية عن الصور لتسريع الأداء وتوفير الإنترنت
                </p>
              </div>
            </div>
          </div>

          {/* 3 Buttons Grid: Blue, Green, Orange */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            {/* 1. Blue Button: رفع ومزامنة البيانات */}
            <button
              type="button"
              onClick={handlePushDataOnlyToCloud}
              disabled={isPushingCloud || isPullingCloud || isUploadingImages}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-xs disabled:opacity-50 text-xs cursor-pointer active:scale-[0.98]"
              title="رفع ومزامنة كافة السجلات النصية فقط بدون الصور"
            >
              <RefreshCw className={`w-4 h-4 ${isPushingCloud ? 'animate-spin' : ''}`} />
              <span>{isPushingCloud ? 'جاري الرفع...' : 'رفع ومزامنة البيانات'}</span>
            </button>

            {/* 2. Green Button: جلب وتحديث البيانات */}
            <button
              type="button"
              onClick={handlePullDataOnlyFromCloud}
              disabled={isPushingCloud || isPullingCloud || isUploadingImages}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all shadow-xs disabled:opacity-50 text-xs cursor-pointer active:scale-[0.98]"
              title="جلب وتحديث كافة السجلات النصية من السحابة بدون الصور بسرعة فائقة"
            >
              <Download className={`w-4 h-4 ${isPullingCloud ? 'animate-spin' : ''}`} />
              <span>{isPullingCloud ? 'جاري التنزيل...' : 'جلب وتحديث البيانات'}</span>
            </button>

            {/* 3. Orange Button: رفع الصور (full width or distinct) */}
            <button
              type="button"
              onClick={handleUploadImagesOnly}
              disabled={isPushingCloud || isPullingCloud || isUploadingImages}
              className="sm:col-span-2 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold transition-all shadow-xs disabled:opacity-50 text-xs cursor-pointer active:scale-[0.98]"
              title="رفع كافة صور الأجهزة المحفوظة محلياً إلى السحابة"
            >
              <ImageIcon className={`w-4 h-4 ${isUploadingImages ? 'animate-pulse' : ''}`} />
              <span>{isUploadingImages ? 'جاري رفع الصور...' : 'رفع الصور'}</span>
            </button>
          </div>

          <div className="text-[11px] text-slate-500 bg-white/80 p-2.5 rounded-xl border border-slate-200/80 leading-relaxed">
            💡 <strong>ملاحظة ذكية:</strong> يتم جلب صور الأجهزة تلقائياً من السحابة عند الدخول لبطاقة كل جهاز وحفظها محلياً بنفس معرّف الـ (ID) لتوفير البيانات.
          </div>
        </div>

        {/* Section 2: Complete System Backup (Data + High-Res Images JSON) */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-indigo-50/70 via-blue-50/40 to-slate-50 border border-indigo-100/80 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <FileJson className="w-4 h-4" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  النسخة الاحتياطية الشاملة (البيانات + الصور)
                </h4>
                <p className="text-[11px] text-slate-500">
                  تصدير حزمة كاملة بصيغة JSON تحتوي على جميع الأجهزة، الصيانة، والمستخدمين مع جميع الصور بدقة كاملة.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleExportFullBackup}
              disabled={isExportingBackup || isImportingBackup}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all shadow-xs disabled:opacity-50 text-xs cursor-pointer"
            >
              <Download className={`w-4 h-4 ${isExportingBackup ? 'animate-spin' : ''}`} />
              <span>{isExportingBackup ? 'جاري التصدير...' : 'تصدير نسخة كاملة (JSON)'}</span>
            </button>

            <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-bold cursor-pointer transition-all shadow-xs text-xs">
              <Upload className={`w-4 h-4 text-indigo-600 ${isImportingBackup ? 'animate-spin' : ''}`} />
              <span>{isImportingBackup ? 'جاري الاستعادة...' : 'استعادة نسخة كاملة (JSON)'}</span>
              <input
                ref={fullBackupInputRef}
                type="file"
                accept=".json"
                onChange={handleImportFullBackup}
                disabled={isExportingBackup || isImportingBackup}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Section 3: Excel Comprehensive File (Visible to Admin Only) */}
        {isAdmin && (
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50/70 via-teal-50/40 to-slate-50 border border-emerald-100/80 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <FileSpreadsheet className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-slate-900 text-sm">
                      النسخ الاحتياطي لملف Excel الشامل
                    </h4>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-900 text-white font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-amber-400" /> للآدمن فقط
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    ملف إكسل متكامل يشمل الأصول، الصيانة، المستخدمين، والسيتات والأدوات الجراحية
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleExportComprehensiveExcel}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all shadow-xs text-xs cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>تصدير ملف Excel الشامل</span>
              </button>

              <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-bold cursor-pointer transition-all shadow-xs text-xs">
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>استيراد ملف Excel شامل</span>
                <input
                  ref={excelComprehensiveInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={handleImportComprehensiveExcel}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-2 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold hover:bg-slate-200 text-xs transition-colors cursor-pointer"
          >
            إغلاق
          </button>
        </div>

      </div>
    </div>
  );
};
