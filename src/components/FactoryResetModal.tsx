import React, { useState } from 'react';
import {
  AlertTriangle,
  Trash2,
  X,
  RefreshCw,
  CheckCircle2,
  HardDrive,
  CloudOff,
} from 'lucide-react';
import { StorageService } from '../services/storage';
import { CloudWipeProgress } from '../services/firestoreSync';
import { clearSurgicalImageCache } from './SurgicalImage';

interface FactoryResetModalProps {
  onClose: () => void;
  onResetComplete: () => void;
}

type ResetMode = 'local' | 'full';

export const FactoryResetModal: React.FC<FactoryResetModalProps> = ({
  onClose,
  onResetComplete,
}) => {
  const [mode, setMode] = useState<ResetMode>('local');
  const [adminPassword, setAdminPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<CloudWipeProgress | null>(null);

  const handleModeChange = (nextMode: ResetMode) => {
    if (isProcessing) return;
    setMode(nextMode);
    setErrorMsg('');
    setConfirmText('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!adminPassword.trim()) {
      setErrorMsg('يرجى إدخال كلمة مرور الأدمن للمتابعة');
      return;
    }

    if (mode === 'full' && confirmText.trim() !== 'إعادة ضبط المصنع') {
      setErrorMsg('يرجى كتابة عبارة التأكيد "إعادة ضبط المصنع" بدقة للمتابعة');
      return;
    }

    setIsProcessing(true);
    setProgress({
      stageLabel: mode === 'local' ? 'جاري البدء بالتصفير المحلي...' : 'جاري بدء الاتصال بالسحابة...',
      stepIndex: 0,
      totalSteps: mode === 'local' ? 2 : 9,
      deletedSoFar: 0,
    });

    try {
      clearSurgicalImageCache();

      const res =
        mode === 'local'
          ? await StorageService.resetLocalAndResyncFromCloud(adminPassword.trim(), setProgress)
          : await StorageService.factoryReset(adminPassword.trim(), setProgress);

      if (res.success) {
        setSuccessMsg(res.message);
        setIsProcessing(false);
        setProgress(null);
      } else {
        setErrorMsg(res.message || 'تعذر تنفيذ العملية');
        setIsProcessing(false);
        setProgress(null);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'حدث خطأ غير متوقع أثناء تنفيذ العملية');
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const progressPercent =
    progress && progress.totalSteps > 0
      ? Math.min(100, Math.max(5, Math.round((progress.stepIndex / progress.totalSteps) * 100)))
      : 5;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 text-right max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b pb-3">
          <div className="flex items-center gap-2 text-slate-900">
            {mode === 'full' ? (
              <AlertTriangle className="w-5 h-5 text-red-600" />
            ) : (
              <RefreshCw className="w-5 h-5 text-sky-600" />
            )}
            <h3 className="text-base font-bold">إعادة ضبط النظام (Factory Reset)</h3>
          </div>
          {!isProcessing && (
            <button
              type="button"
              onClick={successMsg ? onResetComplete : onClose}
              className="text-slate-400 hover:text-slate-600"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {successMsg ? (
          <div className="space-y-4 py-2">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs text-emerald-900">
                <p className="font-bold text-sm">تمت العملية بنجاح</p>
                <p className="leading-relaxed">{successMsg}</p>
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onResetComplete}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                متابعة وتحديث الواجهة
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Mode Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleModeChange('local')}
                disabled={isProcessing}
                className={`p-3 rounded-xl border text-right transition-all ${
                  mode === 'local'
                    ? 'border-sky-500 bg-sky-50 ring-2 ring-sky-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <HardDrive
                    className={`w-4 h-4 ${
                      mode === 'local' ? 'text-sky-600' : 'text-slate-400'
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-900">
                    تصفير محلي وإعادة مزامنة
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  يمسح كاش المتصفح الحالي فقط ويعيد الجلب من السحابة بأمان.
                </p>
              </button>

              <button
                type="button"
                onClick={() => handleModeChange('full')}
                disabled={isProcessing}
                className={`p-3 rounded-xl border text-right transition-all ${
                  mode === 'full'
                    ? 'border-red-500 bg-red-50 ring-2 ring-red-500/20'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <CloudOff
                    className={`w-4 h-4 ${
                      mode === 'full' ? 'text-red-600' : 'text-slate-400'
                    }`}
                  />
                  <span className="text-xs font-bold text-slate-900">
                    ضبط مصنع شامل (محلي + سحابي)
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  يمسح كافة البيانات نهائياً من السحابة وجميع الأجهزة.
                </p>
              </button>
            </div>

            {isProcessing && progress && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800">{progress.stageLabel}</span>
                  <span className="font-mono font-bold text-slate-600">{progressPercent}%</span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      mode === 'full' ? 'bg-red-600' : 'bg-sky-600'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {mode === 'full' && (
                  <div className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>المرحلة {progress.stepIndex} من {progress.totalSteps}</span>
                    <span className="font-mono font-bold text-slate-700">
                      تم مسح {progress.deletedSoFar} سجل
                    </span>
                  </div>
                )}
              </div>
            )}

            {errorMsg && (
              <div className="p-3 bg-red-100 text-red-700 rounded-xl text-xs font-bold border border-red-200">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  كلمة مرور الأدمن الحالية للتأكيد: <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  disabled={isProcessing}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="أدخل كلمة مرور حساب الأدمن"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 font-mono focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                />
              </div>

              {mode === 'full' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    اكتب عبارة التأكيد{' '}
                    <span className="text-red-600 font-mono font-bold">"إعادة ضبط المصنع"</span>:
                  </label>
                  <input
                    type="text"
                    required
                    disabled={isProcessing}
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="إعادة ضبط المصنع"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                >
                  إلغاء
                </button>
                {mode === 'local' ? (
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-600/20 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin' : ''}`} />
                    {isProcessing
                      ? 'جاري التصفير والمزامنة من السحابة...'
                      : 'تصفير محلي وإعادة المزامنة'}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl font-bold bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/20 disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    {isProcessing
                      ? 'جاري مسح السحابة والجهاز...'
                      : 'تأكيد التصفير الشامل (محلي + سحابي)'}
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
