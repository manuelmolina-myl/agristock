import { Outlet } from 'react-router-dom'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { AppSidebar } from './app-sidebar'
import { AppHeader } from './app-header'
import { MobileNav } from './mobile-nav'
import { PageTitleProvider } from '@/contexts/page-title-context'
import { CommandSearch } from '@/components/search/command-search'

export default function AppLayout() {
  return (
    <PageTitleProvider>
      <SidebarProvider defaultOpen={true}>
        <AppSidebar />
        <SidebarInset className="flex flex-col min-h-screen overflow-x-hidden">
          <AppHeader />
          <div className="flex-1 p-4 md:p-6 pb-20 md:pb-6">
            <Outlet />
          </div>
          <MobileNav />
        </SidebarInset>
        {/* Global Cmd+K search */}
        <CommandSearch />
      </SidebarProvider>
    </PageTitleProvider>
  )
}
