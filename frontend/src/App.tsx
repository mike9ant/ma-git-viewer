/**
 * App.tsx - Application root component.
 *
 * Sets up React Query for server state management with:
 * - No refetch on window focus (manual refresh only)
 * - 30s stale time (cache data considered fresh)
 * - Single retry on failure
 *
 * All API data flows through React Query hooks defined in api/hooks.ts.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppLayout } from '@/components/layout/AppLayout'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 30000,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppLayout />
    </QueryClientProvider>
  )
}

export default App
