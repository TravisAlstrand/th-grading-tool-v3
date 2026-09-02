import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PaletteProvider } from '@/components/CommandPalette'
import { ThemeProvider } from '@/components/Theme'
import { ToastProvider } from '@/components/Toast'
import { Launcher } from '@/routes/Launcher'
import { ReviewLayout } from '@/routes/ReviewLayout'
import { Grading } from '@/routes/Grading'
import { Send } from '@/routes/Send'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      // Stale-while-revalidate: a cached rubric renders instantly and is
      // refreshed underneath, so switching projects never shows a spinner
      // for something already fetched.
      gcTime: 30 * 60 * 1000,
    },
  },
})

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <ToastProvider>
            <PaletteProvider>
              <Routes>
                <Route path="/" element={<Launcher />} />
                <Route path="/review/:projectId" element={<ReviewLayout />}>
                  <Route index element={<Grading />} />
                  <Route path="send" element={<Send />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </PaletteProvider>
          </ToastProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
