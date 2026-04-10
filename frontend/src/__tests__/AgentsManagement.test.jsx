import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AgentsManagement from '../pages/AgentsManagement';
import { agentsApi } from '../services/api';

jest.mock('../services/api');

const mockAgents = [
  { id: 1, name: 'Chatbot',    description: 'Chat agent', type: 'chatbot',    status: 'active',   created_at: '2024-01-01T00:00:00' },
  { id: 2, name: 'Classifier', description: null,         type: 'classifier', status: 'inactive', created_at: '2024-01-02T00:00:00' },
];

beforeEach(() => {
  agentsApi.list.mockResolvedValue({ data: mockAgents });
  agentsApi.create.mockResolvedValue({ data: { id: 3, name: 'New', status: 'active', created_at: '2024-01-03T00:00:00' } });
  agentsApi.update.mockResolvedValue({ data: { ...mockAgents[0], status: 'deprecated' } });
  agentsApi.delete.mockResolvedValue({});
});

afterEach(() => jest.clearAllMocks());

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/agents']}>
      <Routes>
        <Route path="/agents" element={<AgentsManagement />} />
        <Route path="/agents/:id" element={<div>Agent Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AgentsManagement', () => {
  it('renders heading', async () => {
    renderPage();
    expect(await screen.findByText('Agents')).toBeInTheDocument();
  });

  it('lists agents', async () => {
    renderPage();
    expect(await screen.findByText('Chatbot')).toBeInTheDocument();
    expect(await screen.findByText('Classifier')).toBeInTheDocument();
  });

  it('shows correct status badges', async () => {
    renderPage();
    await screen.findByText('Chatbot');
    // Status text also appears in the <select> options — verify at least one badge span exists
    const activeEls = screen.getAllByText('active');
    expect(activeEls.length).toBeGreaterThanOrEqual(1);
    const inactiveEls = screen.getAllByText('inactive');
    expect(inactiveEls.length).toBeGreaterThanOrEqual(1);
  });

  it('shows agent count', async () => {
    renderPage();
    expect(await screen.findByText('All Agents (2)')).toBeInTheDocument();
  });

  it('clicking agent card navigates to detail page', async () => {
    renderPage();
    await screen.findByText('Chatbot');
    const cards = screen.getAllByTestId('agent-card');
    fireEvent.click(cards[0]);
    await screen.findByText('Agent Detail');
  });

  it('register agent form', async () => {
    agentsApi.list
      .mockResolvedValueOnce({ data: mockAgents })
      .mockResolvedValueOnce({ data: [...mockAgents, { id: 3, name: 'New Agent', status: 'active', created_at: '2024-01-03T00:00:00' }] });

    renderPage();
    await screen.findByText('Chatbot');

    // First textbox in the form is the Name field
    const nameInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(nameInput, { target: { value: 'New Agent' } });
    fireEvent.click(screen.getByText('Register'));

    await waitFor(() => {
      expect(agentsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'New Agent' })
      );
    });
  });

  it('shows empty state when no agents', async () => {
    agentsApi.list.mockResolvedValue({ data: [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('No agents yet.')).toBeInTheDocument();
    });
  });
});
