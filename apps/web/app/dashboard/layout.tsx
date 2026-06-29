import { Suspense } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import { OpendoraProvider } from './projectflows-context'
import { DashboardShell } from './dashboard-shell'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense>
      <OpendoraProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="flex flex-col min-h-0 overflow-hidden">
            <DashboardShell>
              {children}
            </DashboardShell>
          </SidebarInset>
        </SidebarProvider>
      </OpendoraProvider>
    </Suspense>
  )
}
