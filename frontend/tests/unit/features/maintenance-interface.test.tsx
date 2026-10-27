import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RequestForm } from '@/features/maintenance/RequestForm'
import { RequestCard } from '@/features/maintenance/RequestCard'
import { useMaintenanceRequests } from '@/features/maintenance/useMaintenance'
import {
  createMaintenanceRequest,
  changeMaintenanceStatus,
  watchMaintenanceRequests,
  watchStatusHistory,
  type RequestRecord,
} from '@/features/maintenance/store'

vi.mock('@/features/maintenance/store', () => ({
  createMaintenanceRequest: vi.fn(),
  changeMaintenanceStatus: vi.fn(),
  watchMaintenanceRequests: vi.fn(),
  watchStatusHistory: vi.fn(),
}))
const time = { toDate: () => new Date('2026-10-28T03:00:00Z') }
const request = {
  id: 'request-a',
  pendantId: 'P001',
  problemType: 'BATTERY',
  description: 'Battery does not hold a charge.',
  status: 'OPEN',
  createdBy: 'alice',
  createdAt: time,
  updatedAt: time,
  lastHistoryId: 'request-a_OPEN',
  _schemaVersion: 1,
  pending: false,
} as RequestRecord
function fillForm() {
  fireEvent.change(screen.getByLabelText('Pendant'), { target: { value: 'P001' } })
  fireEvent.change(screen.getByLabelText('Problem type'), { target: { value: 'BATTERY' } })
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: request.description } })
}
afterEach(cleanup)
beforeEach(() => {
  vi.resetAllMocks()
})

describe('request interface', () => {
  it('validates before writing and reports successful creation', async () => {
    vi.mocked(createMaintenanceRequest).mockResolvedValue('request-a')
    render(<RequestForm uid="alice" online />)
    fireEvent.click(screen.getByRole('button', { name: 'Create request' }))
    expect(createMaintenanceRequest).not.toHaveBeenCalled()
    expect(screen.getByText('Select one of the five pendants.')).toBeInTheDocument()
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create request' }))
    await screen.findByText('Request created for P001.')
    expect(createMaintenanceRequest).toHaveBeenCalledWith('alice', {
      pendantId: 'P001',
      problemType: 'BATTERY',
      description: request.description,
    })
    expect(screen.getByLabelText('Description')).toHaveValue('')
  })
  it('keeps input after a rejected write', async () => {
    vi.mocked(createMaintenanceRequest).mockRejectedValue(new Error('Write rejected'))
    render(<RequestForm uid="alice" online />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Write rejected')
    expect(screen.getByLabelText('Description')).toHaveValue(request.description)
  })
  it('prevents another submission while database confirmation is pending', async () => {
    let finish!: (id: string) => void
    vi.mocked(createMaintenanceRequest).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    render(<RequestForm uid="alice" online />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create request' }))
    fireEvent.click(screen.getByRole('button', { name: 'Saving request…' }))
    expect(createMaintenanceRequest).toHaveBeenCalledTimes(1)
    await act(async () => finish('request-a'))
  })
  it('uses the displayed status as the transaction precondition', async () => {
    vi.mocked(changeMaintenanceStatus).mockResolvedValue(undefined)
    render(<RequestCard uid="alice" online request={request} />)
    fireEvent.click(screen.getByRole('button', { name: 'Start work' }))
    await waitFor(() =>
      expect(changeMaintenanceStatus).toHaveBeenCalledWith(
        'alice',
        'request-a',
        'OPEN',
        'IN_PROGRESS'
      )
    )
  })
  it('locks completed and pending requests and blocks offline writes', () => {
    const view = render(
      <RequestCard uid="alice" online request={{ ...request, status: 'COMPLETED' }} />
    )
    expect(
      screen.queryByRole('button', { name: /Start work|Complete request/ })
    ).not.toBeInTheDocument()
    view.rerender(<RequestCard uid="alice" online request={{ ...request, pending: true }} />)
    expect(screen.getByRole('button', { name: 'Start work' })).toBeDisabled()
    view.rerender(<RequestCard uid="alice" online={false} request={request} />)
    expect(screen.getByRole('button', { name: 'Start work' })).toBeDisabled()
  })
  it('loads history only when opened and unsubscribes when closed', async () => {
    const unsubscribe = vi.fn()
    vi.mocked(watchStatusHistory).mockImplementation((_uid, _id, changed) => {
      changed([
        {
          id: 'request-a_OPEN',
          requestId: 'request-a',
          fromStatus: null,
          toStatus: 'OPEN',
          changedBy: 'alice',
          changedAt: request.createdAt,
          _schemaVersion: 1,
          pending: false,
        },
      ])
      return unsubscribe
    })
    render(<RequestCard uid="alice" online request={request} />)
    expect(watchStatusHistory).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'View history' }))
    expect(await screen.findByText('Created as Open')).toBeInTheDocument()
    expect(watchStatusHistory).toHaveBeenCalledWith(
      'alice',
      'request-a',
      expect.any(Function),
      expect.any(Function)
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hide history' }))
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
  it('clears old account data and ignores callbacks after unsubscribe', () => {
    const callbacks: Array<(rows: RequestRecord[]) => void> = []
    const unsubscribe = vi.fn()
    vi.mocked(watchMaintenanceRequests).mockImplementation((_uid, changed) => {
      callbacks.push(changed)
      return unsubscribe
    })
    const view = renderHook(({ uid }) => useMaintenanceRequests(uid), {
      initialProps: { uid: 'alice' },
    })
    act(() => callbacks[0]!([request]))
    expect(view.result.current.rows).toHaveLength(1)
    view.rerender({ uid: 'bob' })
    expect(view.result.current.rows).toEqual([])
    expect(view.result.current.loading).toBe(true)
    act(() => callbacks[0]!([request]))
    expect(view.result.current.rows).toEqual([])
    act(() => callbacks[1]!([]))
    expect(view.result.current.loading).toBe(false)
    expect(unsubscribe).toHaveBeenCalledOnce()
  })
})
