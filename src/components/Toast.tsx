import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

type ToastTone = 'ok' | 'plain'
type ToastValue = { message: string; tone: ToastTone; id: number } | null

const ToastContext = createContext<(message: string, tone?: ToastTone) => void>(() => {})

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastValue>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const seq = useRef(0)

  const flash = useCallback((message: string, tone: ToastTone = 'ok') => {
    seq.current += 1
    setToast({ message, tone, id: seq.current })
  }, [])

  useEffect(() => {
    if (!toast) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2400)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [toast])

  const value = useMemo(() => flash, [flash])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="sr-only">
        {toast?.message ?? ''}
      </div>
      {toast && (
        <div
          className={cn(
            'fixed bottom-[54px] left-1/2 z-60 -translate-x-1/2 rounded-lg px-[18px] py-2.5',
            'text-[13px] font-bold shadow-[0_12px_30px_-12px_rgba(0,0,0,.7)]',
            toast.tone === 'ok' ? 'bg-accent text-bg' : 'bg-edge text-ink',
          )}
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  )
}
