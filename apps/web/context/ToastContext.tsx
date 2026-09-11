"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, title: string, message?: string) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle2 size={18} className="text-[#00D084] shrink-0" />,
  error: <AlertCircle size={18} className="text-[#FF4D5E] shrink-0" />,
  warning: <AlertTriangle size={18} className="text-[#F59E0B] shrink-0" />,
  info: <Info size={18} className="text-[#60A5FA] shrink-0" />,
};

const BORDERS: Record<ToastType, string> = {
  success: "1px solid #00D08433",
  error: "1px solid #FF4D5E44",
  warning: "1px solid #F59E0B33",
  info: "1px solid #60A5FA33",
};

const BACKGROUNDS: Record<ToastType, string> = {
  success: "rgba(13, 27, 22, 0.95)",
  error: "rgba(26, 15, 20, 0.95)",
  warning: "rgba(28, 22, 13, 0.95)",
  info: "rgba(13, 24, 41, 0.95)",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string) => {
      const id = Math.random().toString(36).slice(2, 9);
      setToasts((prev) => [...prev, { id, type, title, message }]);

      // Auto dismiss after 4.5 seconds
      setTimeout(() => {
        removeToast(id);
      }, 4500);
    },
    [removeToast]
  );

  const success = useCallback(
    (title: string, message?: string) => showToast("success", title, message),
    [showToast]
  );
  const error = useCallback(
    (title: string, message?: string) => showToast("error", title, message),
    [showToast]
  );
  const warning = useCallback(
    (title: string, message?: string) => showToast("warning", title, message),
    [showToast]
  );
  const info = useCallback(
    (title: string, message?: string) => showToast("info", title, message),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}

      {/* Floating toast notification container */}
      <div className="fixed top-20 right-4 sm:right-6 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="pointer-events-auto rounded-xl p-3.5 shadow-2xl backdrop-blur-md flex items-start gap-3 transition-all animate-in fade-in slide-in-from-top-2"
            style={{
              background: BACKGROUNDS[toast.type],
              border: BORDERS[toast.type],
            }}
          >
            {ICONS[toast.type]}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-[#F2F4F7]">{toast.title}</p>
              {toast.message && (
                <p className="text-[11px] text-[#8B93A7] mt-0.5 leading-relaxed break-words">
                  {toast.message}
                </p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-[#8B93A7] hover:text-[#F2F4F7] p-0.5 shrink-0 transition-colors"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
