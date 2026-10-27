import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { MaintenanceBoard } from '@/features/maintenance/MaintenanceBoard'
import type { RequestRecord } from '@/features/maintenance/store'
const state = vi.hoisted(() => ({
  rows: [] as RequestRecord[],
  loading: false,
  error: null as string | null,
  retry: vi.fn(),
  online: true,
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { uid: 'alice' }, loading: false }) }))
vi.mock('@/features/maintenance/useMaintenance', () => ({
  useMaintenanceRequests: () => state,
  useOnlineStatus: () => state.online,
}))
vi.mock('@/features/maintenance/RequestForm', () => ({
  RequestForm: () => <div>Request form</div>,
}))
vi.mock('@/features/maintenance/RequestCard', () => ({
  RequestCard: ({ request }: { request: RequestRecord }) => (
    <article>{request.description}</article>
  ),
}))
afterEach(cleanup)
beforeEach(() => {
  state.rows = []
  state.loading = false
  state.error = null
  state.online = true
  state.retry.mockReset()
})
it('distinguishes loading, failure and a confirmed empty result', () => {
  state.loading = true
  const view = render(<MaintenanceBoard />)
  expect(screen.getByText('Loading requests…')).toBeInTheDocument()
  expect(screen.queryByText('No requests yet')).not.toBeInTheDocument()
  state.loading = false
  state.error = 'Access denied'
  view.rerender(<MaintenanceBoard />)
  expect(screen.getByRole('alert')).toHaveTextContent('Access denied')
  expect(screen.queryByText('No requests yet')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect(state.retry).toHaveBeenCalledOnce()
  state.error = null
  view.rerender(<MaintenanceBoard />)
  expect(screen.getByText('No requests yet')).toBeInTheDocument()
})
it('filters requests without treating an unmatched filter as an empty account', () => {
  state.rows = [{ id: 'a', status: 'OPEN', description: 'Battery problem' } as RequestRecord]
  render(<MaintenanceBoard />)
  expect(screen.getByText('Battery problem')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Filter by status' }), {
    target: { value: 'COMPLETED' },
  })
  expect(screen.queryByText('Battery problem')).not.toBeInTheDocument()
  expect(screen.getByText('No requests with this status')).toBeInTheDocument()
})
it('warns that offline records may be cached', () => {
  state.online = false
  render(<MaintenanceBoard />)
  expect(screen.getByRole('status')).toHaveTextContent('Displayed records may be cached')
})
