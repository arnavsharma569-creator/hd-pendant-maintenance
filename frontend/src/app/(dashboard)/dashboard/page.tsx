import type { Metadata } from 'next'
import { MaintenancePage } from '@/features/maintenance/MaintenancePage'

export const metadata: Metadata = { title: 'Pendant maintenance' }

export default function DashboardPage() {
  return <MaintenancePage />
}
