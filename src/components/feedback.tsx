"use client";
import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, PackageOpen } from "lucide-react";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
const ToastContext = createContext<(message: string, error?: boolean) => void>(
  () => {},
);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  const notify = useCallback((message: string, error = false) => {
    setToast({ message, error });
    setTimeout(() => setToast(null), 4500);
  }, []);
  return (
    <ToastContext.Provider value={notify}>
      {children}
      {toast && (
        <div
          role="status"
          className={`toast ${toast.error ? "toast-error" : ""}`}
        >
          {toast.error ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}{" "}
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function Empty({
  title = "Nothing here yet",
  text,
  children,
}: {
  title?: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <PackageOpen size={32} />
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Loading() {
  return (
    <div className="loading-grid" aria-label="Loading">
      <Skeleton className="h-36" />
      <Skeleton className="h-36" />
      <Skeleton className="h-36" />
    </div>
  );
}
export function Failure({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <AlertCircle size={20} />
      <p>{message}</p>
      {retry && (
        <Button variant="outline" size="sm" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}
