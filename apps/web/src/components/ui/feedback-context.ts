import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error';
export type Notify = (message: string, tone?: ToastTone) => void;

export const ToastContext = createContext<Notify>(() => undefined);

export function useToast() {
  return useContext(ToastContext);
}
