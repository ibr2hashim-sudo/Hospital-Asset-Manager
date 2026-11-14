import React, { useState, useEffect } from 'react';
import {
  Package,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  LogIn,
  Shield,
  AlertCircle,
  Cloud,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';
import { User } from '../types';
import { StorageService } from '../services/storage';
import { FirestoreSyncService } from '../services/firestoreSync';

interface LoginViewProps {
  users?: User[];
  onLogin: (user: User) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncingUsers, setIsSyncingUsers] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    const autoSyncUsers = async () => {
      setIsSyncingUsers(true);
      try {
        const res = await FirestoreSyncService.syncUsersFromCloud();
        if (mounted && res.success && res.updatedCount > 0) {
          setSyncStatusMsg({
            text: `تم جلب وتحديث حسابات المستخدمين من السحابة (${res.count} حساب).`,
            type: 'info',
          });
        }
      } finally {
        if (mounted) {
          setIsSyncingUsers(false);
        }
      }
    };
    autoSyncUsers();
    return () => {
      mounted = false;
    };
  }, []);

  const handleManualSyncUsers = async () => {
    if (isSyncingUsers) return;
    setIsSyncingUsers(true);
    setErrorMessage('');
    setSyncStatusMsg(null);
    try {
      const res = await FirestoreSyncService.syncUsersFromCloud();
      setSyncStatusMsg({
        text: res.message,
        type: res.success ? 'success' : 'error',
      });
    } catch (err: any) {
      setSyncStatusMsg({
        text: err?.message || 'فشل مزامنة المستخدمين من السحابة',
        type: 'error',
      });
    } finally {
      setIsSyncingUsers(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setIsLoading(true);

    try {
      if (!username.trim()) {
        throw new Error('يرجى إدخال اسم المستخدم');
      }
      if (!password) {
        throw new Error('يرجى إدخال كلمة المرور');
      }

      try {
        const loggedInUser = StorageService.login(username, password);
        setIsLoading(false);
        onLogin(loggedInUser);
        return;
      } catch (localErr: any) {
        // Attempt syncing users from Firestore before rejecting credentials
        setIsSyncingUsers(true);
        const syncRes = await FirestoreSyncService.syncUsersFromCloud();
        setIsSyncingUsers(false);

        if (syncRes.success) {
          const retryUser = StorageService.login(username, password);
          setIsLoading(false);
          onLogin(retryUser);
          return;
        }
        throw localErr;
      }
    } catch (err: any) {
      setIsLoading(false);
      setErrorMessage(err?.message || 'فشل تسجيل الدخول، تأكد من صحة البيانات');
    }
  };

  return (
    <div
      id="login-view-container"
      className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 font-['Tajawal',sans-serif] text-right relative overflow-hidden select-none"
      dir="rtl"
    >
      {/* Background Decorative Ambient Gradients */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-slate-900/50 rounded-full blur-2xl pointer-events-none" />

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex p-3 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-lg shadow-blue-500/25 ring-4 ring-blue-500/10">
            <Package className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-wide">
              نظام إدارة الأصول والصيانة
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              منظومة تتبع العهد وبلاغات الأعطال والصيانة الوقائية
            </p>
          </div>
        </div>

        {/* Error Alert Box */}
        {errorMessage && (
          <div
            id="login-error-alert"
            className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold flex items-center gap-2.5 animate-shake"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Sync Status Alert Box */}
        {syncStatusMsg && (
          <div
            className={`p-3 rounded-2xl border text-xs font-semibold flex items-center gap-2.5 ${
              syncStatusMsg.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : syncStatusMsg.type === 'error'
                ? 'bg-red-500/10 border-red-500/30 text-red-300'
                : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
            }`}
          >
            {syncStatusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            ) : syncStatusMsg.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            ) : (
              <Cloud className="w-4 h-4 shrink-0 text-blue-400" />
            )}
            <span>{syncStatusMsg.text}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="block font-bold text-slate-300">اسم المستخدم</label>
            <div className="relative">
              <input
                id="login-username-input"
                type="text"
                required
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                className="w-full pl-3 pr-10 py-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white placeholder:text-slate-500 font-medium text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-right"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <UserIcon className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-slate-300">كلمة المرور</label>
            </div>
            <div className="relative">
              <input
                id="login-password-input"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-3 rounded-xl bg-slate-950/80 border border-slate-700/80 text-white placeholder:text-slate-500 font-mono text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-right"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                <Lock className="w-4 h-4" />
              </div>
              <button
                type="button"
                id="login-toggle-password-btn"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors focus:outline-none"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            id="login-submit-button"
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <span className="inline-block animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            <span>تسجيل الدخول للنظام</span>
          </button>

          {/* Manual Sync Users Button */}
          <button
            id="login-sync-users-button"
            type="button"
            onClick={handleManualSyncUsers}
            disabled={isSyncingUsers || isLoading}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white font-semibold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-emerald-400 ${isSyncingUsers ? 'animate-spin' : ''}`} />
            <span>{isSyncingUsers ? 'جاري مزامنة المستخدمين من السحابة...' : 'مزامنة المستخدمين من السحابة'}</span>
          </button>
        </form>

        {/* Footer Security Badges */}
        <div className="pt-2 flex items-center justify-center gap-4 text-[10px] text-slate-500 border-t border-slate-800/80">
          <div className="flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-blue-500" />
            <span>نظام مشفر وآمن</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1">
            <Cloud className="w-3.5 h-3.5 text-emerald-500" />
            <span>مزامنة سحابية حية</span>
          </div>
        </div>
      </div>

      {/* Developer Copyright & Attribution */}
      <div className="mt-6 text-center space-y-1 text-slate-400 text-xs z-10">
        <p className="font-semibold text-slate-300">
          إدارة الأصول والهندسة الطبية © 2026 | جميع الحقوق محفوظة
        </p>
        <p className="text-[11px] text-slate-500">
          إعداد وتنفيذ: <span className="text-slate-300 font-bold">المهندس إبراهيم هاشم</span> (تطوير وإدارة النظام)
        </p>
      </div>
    </div>
  );
};
