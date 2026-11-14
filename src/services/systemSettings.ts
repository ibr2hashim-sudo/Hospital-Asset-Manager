import { SystemFontFamily, SystemSettings } from '../types';

export const SYSTEM_SETTINGS_STORAGE_KEY = 'asset_mgmt_system_settings';

export const SYSTEM_FONT_OPTIONS: Array<{
  value: SystemFontFamily;
  label: string;
  description: string;
}> = [
  {
    value: 'Tajawal',
    label: 'تجوال (Tajawal) — الافتراضي',
    description: 'خط عربي واضح وحديث ومريح للعين في القراءة والجداول',
  },
  {
    value: 'Cairo',
    label: 'القاهرة (Cairo)',
    description: 'خط هندسي عصري بارز ومميز للعناوين والبيانات',
  },
  {
    value: 'IBM Plex Sans Arabic',
    label: 'IBM عربي (IBM Plex Sans Arabic)',
    description: 'خط تقني احترافي منظم مثالي للأنظمة الإدارية والطبية',
  },
  {
    value: 'Almarai',
    label: 'المراعي (Almarai)',
    description: 'خط عربي سلس ونقي بأوزان متناسقة ووضوح عالٍ',
  },
  {
    value: 'Readex Pro',
    label: 'ريدكس برو (Readex Pro)',
    description: 'خط متوازن ومدروس لتحسين سرعة القراءة على الشاشات',
  },
];

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  systemTitle: 'نظام إدارة الأصول والصيانة',
  systemSubtitle: 'إدارة العهد • بلاغات الأعطال • الصيانة الدورية',
  logoDataUrl: '',
  fontFamily: 'Tajawal',
  fontSizeScale: 'normal',
  headerDensity: 'normal',
  tabLabels: {
    dashboard: 'الرئيسية',
    assets: 'العهد والأصول',
    tickets: 'طلبات الصيانة',
    periodic: 'الصيانة الدورية',
    audit: 'الجرد والمطابقة',
    surgical: 'الأدوات الجراحية',
    users: 'الإعدادات',
  },
};

export class SystemSettingsService {
  static getSettings(): SystemSettings {
    try {
      const raw = localStorage.getItem(SYSTEM_SETTINGS_STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SYSTEM_SETTINGS, tabLabels: { ...DEFAULT_SYSTEM_SETTINGS.tabLabels } };
      const parsed = JSON.parse(raw) as Partial<SystemSettings>;
      return {
        ...DEFAULT_SYSTEM_SETTINGS,
        ...parsed,
        tabLabels: {
          ...DEFAULT_SYSTEM_SETTINGS.tabLabels,
          ...(parsed.tabLabels || {}),
        },
      };
    } catch {
      return { ...DEFAULT_SYSTEM_SETTINGS, tabLabels: { ...DEFAULT_SYSTEM_SETTINGS.tabLabels } };
    }
  }

  static applyToDocument(settings: SystemSettings): void {
    if (typeof document === 'undefined') return;

    const fontName = settings.fontFamily || 'Tajawal';
    document.documentElement.style.setProperty(
      '--app-font-family',
      `'${fontName}', 'Tajawal', sans-serif`
    );

    const scalePx =
      settings.fontSizeScale === 'compact'
        ? '15px'
        : settings.fontSizeScale === 'comfortable'
        ? '17px'
        : '16px';
    document.documentElement.style.fontSize = scalePx;

    if (settings.systemTitle?.trim()) {
      document.title = settings.systemTitle.trim();
    }
  }

  static saveSettingsLocal(settings: SystemSettings): SystemSettings {
    const normalized: SystemSettings = {
      systemTitle: (settings.systemTitle || '').trim() || DEFAULT_SYSTEM_SETTINGS.systemTitle,
      systemSubtitle: (settings.systemSubtitle || '').trim() || DEFAULT_SYSTEM_SETTINGS.systemSubtitle,
      logoDataUrl: settings.logoDataUrl || '',
      fontFamily: settings.fontFamily || 'Tajawal',
      fontSizeScale: settings.fontSizeScale || 'normal',
      headerDensity: settings.headerDensity || 'normal',
      tabLabels: {
        dashboard: (settings.tabLabels?.dashboard || '').trim() || DEFAULT_SYSTEM_SETTINGS.tabLabels.dashboard,
        assets: (settings.tabLabels?.assets || '').trim() || DEFAULT_SYSTEM_SETTINGS.tabLabels.assets,
        tickets: (settings.tabLabels?.tickets || '').trim() || DEFAULT_SYSTEM_SETTINGS.tabLabels.tickets,
        periodic: (settings.tabLabels?.periodic || '').trim() || DEFAULT_SYSTEM_SETTINGS.tabLabels.periodic,
        audit: (settings.tabLabels?.audit || '').trim() || DEFAULT_SYSTEM_SETTINGS.tabLabels.audit,
        surgical: (settings.tabLabels?.surgical || '').trim() || DEFAULT_SYSTEM_SETTINGS.tabLabels.surgical,
        users: (settings.tabLabels?.users || '').trim() || DEFAULT_SYSTEM_SETTINGS.tabLabels.users,
      },
      updatedAt: settings.updatedAt || new Date().toISOString(),
    };

    try {
      localStorage.setItem(SYSTEM_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    } catch (e) {
      console.warn('Could not save system settings to localStorage:', e);
    }

    this.applyToDocument(normalized);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('system-settings-updated', { detail: normalized }));
    }

    return normalized;
  }

  static compressLogoFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) {
        reject(new Error('يرجى اختيار ملف صورة صالح (PNG, JPG, SVG, WEBP)'));
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error('تعذر قراءة ملف الصورة'));
      reader.onload = () => {
        const result = reader.result as string;

        // Keep small SVGs directly
        if (file.type === 'image/svg+xml' && result.length < 120000) {
          resolve(result);
          return;
        }

        const img = new Image();
        img.onerror = () => reject(new Error('ملف الصورة غير صالح'));
        img.onload = () => {
          const maxDim = 256;
          let width = img.width || maxDim;
          let height = img.height || maxDim;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(result);
            return;
          }
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          // Use PNG to preserve logo transparency cleanly
          const compressed = canvas.toDataURL('image/png');
          resolve(compressed);
        };
        img.src = result;
      };
      reader.readAsDataURL(file);
    });
  }
}
