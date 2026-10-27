import type { Metadata } from 'next'
import { MaintenanceBoard } from '@/features/maintenance/MaintenanceBoard'

export const metadata: Metadata = { title: 'Pendant maintenance' }

export default function DashboardPage() {
  return <MaintenanceBoard />
}
