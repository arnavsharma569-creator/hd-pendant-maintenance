import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MaintenancePage } from '@/features/maintenance/MaintenancePage'
import {
  createMaintenanceRequest,
  changeMaintenanceStatus,
  watchMaintenanceRequests,
  watchStatusHistory,
  type RequestRecord,
} from '@/features/maintenance/store'

// Use fake database calls so these screen tests never contact Firebase.
vi.mock('@/features/maintenance/store', () => ({
  createMaintenanceRequest: vi.fn(),
  changeMaintenanceStatus: vi.fn(),
  watchMaintenanceRequests: vi.fn(),
  watchStatusHistory: vi.fn(),
  debugMaintenance: vi.fn(),
}))
const account = vi.hoisted(() => ({ uid: 'alice' }))
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { uid: account.uid }, loading: false }),
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
let showRequests: (rows: RequestRecord[]) => void
let failRequests: (error: Error) => void
const stopRequests = vi.fn()

function fillForm() {
  fireEvent.change(screen.getByLabelText('Pendant'), { target: { value: 'P001' } })
  fireEvent.change(screen.getByLabelText('Problem type'), { target: { value: 'BATTERY' } })
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: request.description } })
}

beforeEach(() => {
  vi.resetAllMocks()
  account.uid = 'alice'
  vi.mocked(watchMaintenanceRequests).mockImplementation((_uid, changed, failed) => {
    showRequests = changed
    failRequests = failed
    return stopRequests
  })
})
afterEach(cleanup)

describe('maintenance screen', () => {
  it('validates the form and creates a request with the entered values', async () => {
    vi.mocked(createMaintenanceRequest).mockResolvedValue('request-a')
    render(<MaintenancePage />)
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

  it('shows a save error and keeps the description for another attempt', async () => {
    vi.mocked(createMaintenanceRequest).mockRejectedValue(new Error('Write rejected'))
    render(<MaintenancePage />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create request' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Write rejected')
    expect(screen.getByLabelText('Description')).toHaveValue(request.description)
  })

  it('blocks another create click while the save is waiting', () => {
    // Keep the fake save unfinished to check the disabled button.
    vi.mocked(createMaintenanceRequest).mockReturnValue(new Promise(() => {}))
    render(<MaintenancePage />)
    fillForm()
    fireEvent.click(screen.getByRole('button', { name: 'Create request' }))
    const button = screen.getByRole('button', { name: 'Saving request…' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(createMaintenanceRequest).toHaveBeenCalledOnce()
  })

  it('starts work, completes it and removes the status action when completed', async () => {
    vi.mocked(changeMaintenanceStatus).mockResolvedValue(undefined)
    render(<MaintenancePage />)
    act(() => showRequests([request]))
    fireEvent.click(screen.getByRole('button', { name: 'Start work' }))
    await screen.findByText('Status changed to In progress.')
    expect(changeMaintenanceStatus).toHaveBeenLastCalledWith(
      'alice',
      'request-a',
      'OPEN',
      'IN_PROGRESS'
    )
    act(() => showRequests([{ ...request, status: 'IN_PROGRESS' }]))
    fireEvent.click(screen.getByRole('button', { name: 'Complete request' }))
    await screen.findByText('Status changed to Completed.')
    expect(changeMaintenanceStatus).toHaveBeenLastCalledWith(
      'alice',
      'request-a',
      'IN_PROGRESS',
      'COMPLETED'
    )
    act(() => showRequests([{ ...request, status: 'COMPLETED' }]))
    expect(
      screen.queryByRole('button', { name: /Start work|Complete request/ })
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('Request counts')).toHaveTextContent('Completed1requests')
  })

  it('opens the selected request history and stops listening when closed', async () => {
    const stopHistory = vi.fn()
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
      return stopHistory
    })
    render(<MaintenancePage />)
    act(() => showRequests([request]))
    fireEvent.click(screen.getByRole('button', { name: 'View history' }))
    expect(await screen.findByText('Created as Open')).toBeInTheDocument()
    expect(watchStatusHistory).toHaveBeenCalledWith(
      'alice',
      'request-a',
      expect.any(Function),
      expect.any(Function)
    )
    fireEvent.click(screen.getByRole('button', { name: 'Hide history' }))
    expect(stopHistory).toHaveBeenCalledOnce()
  })

  it('distinguishes loading, failed loading and an empty list, and can retry', () => {
    render(<MaintenancePage />)
    expect(screen.getByText('Loading requests…')).toBeInTheDocument()
    expect(screen.queryByText('No requests yet')).not.toBeInTheDocument()
    act(() => failRequests(new Error('Connection failed')))
    expect(screen.getByRole('alert')).toHaveTextContent('Connection failed')
    expect(screen.queryByText('No requests yet')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(watchMaintenanceRequests).toHaveBeenCalledTimes(2)
    act(() => showRequests([]))
    expect(screen.getByText('No requests yet')).toBeInTheDocument()
  })

  it('filters saved requests by status without changing the total counts', () => {
    render(<MaintenancePage />)
    act(() => showRequests([request]))
    expect(screen.getByText(request.description)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'COMPLETED' } })
    expect(screen.queryByText(request.description)).not.toBeInTheDocument()
    expect(screen.getByText('No requests with this status')).toBeInTheDocument()
    expect(screen.getByLabelText('Request counts')).toHaveTextContent('Open1requests')
  })

  it('clears the previous account and ignores its late database response', () => {
    const view = render(<MaintenancePage />)
    const oldListener = showRequests
    act(() => showRequests([request]))
    account.uid = 'bob'
    view.rerender(<MaintenancePage />)
    expect(screen.queryByText(request.description)).not.toBeInTheDocument()
    act(() => oldListener([request]))
    expect(screen.queryByText(request.description)).not.toBeInTheDocument()
    expect(stopRequests).toHaveBeenCalledOnce()
  })

  it('disables status actions while pending or offline', async () => {
    render(<MaintenancePage />)
    act(() => showRequests([{ ...request, pending: true }]))
    expect(screen.getByRole('button', { name: 'Start work' })).toBeDisabled()
    act(() => showRequests([request]))
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      act(() => window.dispatchEvent(new Event('offline')))
      await waitFor(() => expect(screen.getByRole('button', { name: 'Start work' })).toBeDisabled())
      expect(screen.getByRole('button', { name: 'Create request' })).toBeDisabled()
    } finally {
      online.mockRestore()
    }
  })
})
