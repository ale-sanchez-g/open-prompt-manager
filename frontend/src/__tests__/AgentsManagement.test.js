import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AgentsManagement from '../pages/AgentsManagement';
import { agentsApi } from '../services/api';

jest.mock('../services/api');

const mockAgents = [
  { id: 1, name: 'Chatbot',    description: 'Chat agent', type: 'chatbot',    status: 'active',     created_at: '2024-01-01T00:00:00' },
  { id: 2, name: 'Classifier', description: null,         type: 'classifier', status: 'inactive',   created_at: '2024-01-02T00:00:00' },
];

beforeEach(() => {
  agentsApi.list.mockResolvedValue({ data: mockAgents });
  agentsApi.create.mockResolvedValue({ data: { id: 3, name: 'New', status: 'active', created_at: '2024-01-03T00:00:00' } });
  agentsApi.update.mockResolvedValue({ data: { ...mockAgents[0], status: 'deprecated' } });
  agentsApi.delete.mockResolvedValue({});
});

afterEach(() => jest.clearAllMocks());

function renderPage() {
  return render(<MemoryRouter><AgentsManagement /></MemoryRouter>);
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
    expect(await screen.findByText('active')).toBeInTheDocument();
    expect(await screen.findByText('inactive')).toBeInTheDocument();
  });

  it('shows agent count', async () => {
    renderPage();
    expect(await screen.findByText('All Agents (2)')).toBeInTheDocument();
  });

  it('submits create agent form', async () => {
    agentsApi.list
      .mockResolvedValueOnce({ data: mockAgents })
      .mockResolvedValueOnce({ data: [...mockAgents, { id: 3, name: 'New Agent', status: 'active', created_at: '2024-01-03T00:00:00' }] });

    renderPage();
    await screen.findByText('Chatbot');

    const nameInput = screen.getByPlaceholderText('');
    fireEvent.change(nameInput, { target: { value: 'New Agent' } });
    fireEvent.click(screen.getByText('Create'));

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
