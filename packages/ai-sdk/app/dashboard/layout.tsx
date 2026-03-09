import { AppSidebar } from '@/components/app-sidebar'
import { OpendoraProvider } from './opendora-context'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <OpendoraProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset className="flex flex-col min-h-0 overflow-hidden">
          {children}
        </SidebarInset>
      </SidebarProvider>
    </OpendoraProvider>
  )
}
