import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AgentDetail from '../pages/AgentDetail';
import { agentsApi } from '../services/api';

jest.mock('../services/api');

const mockAgent = {
  id: 1,
  name: 'SwagBot',
  description: 'Customer support agent',
  type: 'chatbot',
  status: 'active',
  created_at: '2024-01-01T00:00:00',
  updated_at: '2024-06-01T00:00:00',
  execution_count: 36,
  success_rate: 1.0,
  avg_rating: 4.4,
  prompts: [
    { id: 10, name: 'Support Prompt', version: '1.0.0', description: 'Help text', avg_rating: 4.5, usage_count: 20, success_rate: 1.0, created_at: '2024-01-01T00:00:00', updated_at: '2024-01-01T00:00:00' },
  ],
};

function renderPage(id = '1') {
  return render(
    <MemoryRouter initialEntries={[`/agents/${id}`]}>
      <Routes>
        <Route path="/agents/:id" element={<AgentDetail />} />
        <Route path="/agents" element={<div>Agents List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  agentsApi.get.mockResolvedValue({ data: mockAgent });
  agentsApi.update.mockResolvedValue({ data: { ...mockAgent, status: 'inactive' } });
  agentsApi.delete.mockResolvedValue({});
});

afterEach(() => jest.clearAllMocks());

describe('AgentDetail', () => {
  it('renders agent name and badges', async () => {
    renderPage();
    expect(await screen.findByText('SwagBot')).toBeInTheDocument();
    expect(screen.getByText('active')).toBeInTheDocument();
    expect(screen.getByText('chatbot')).toBeInTheDocument();
  });

  it('renders description', async () => {
    renderPage();
    expect(await screen.findByText('Customer support agent')).toBeInTheDocument();
  });

  it('renders execution metrics', async () => {
    renderPage();
    await screen.findByText('SwagBot');
    expect(screen.getByText('36')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('4.4')).toBeInTheDocument();
  });

  it('renders associated prompt link', async () => {
    renderPage();
    const promptLink = await screen.findByRole('link', { name: /support prompt/i });
    expect(promptLink).toBeInTheDocument();
    expect(promptLink).toHaveAttribute('href', '/prompts/10');
  });

  it('renders metadata', async () => {
    renderPage();
    await screen.findByText('SwagBot');
    expect(screen.getByText(/ID: #1/)).toBeInTheDocument();
    expect(screen.getByText(/Status: active/)).toBeInTheDocument();
    expect(screen.getByText(/Type: chatbot/)).toBeInTheDocument();
  });

  it('shows Back button that navigates to /agents', async () => {
    renderPage();
    await screen.findByText('SwagBot');
    fireEvent.click(screen.getByText('Back'));
    await screen.findByText('Agents List');
  });

  it('toggles inline edit form', async () => {
    renderPage();
    await screen.findByText('SwagBot');
    fireEvent.click(screen.getByText('Edit'));
    expect(await screen.findByText('Edit Agent')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(screen.queryByText('Edit Agent')).not.toBeInTheDocument();
    });
  });

  it('saves edits', async () => {
    renderPage();
    await screen.findByText('SwagBot');
    fireEvent.click(screen.getByText('Edit'));
    await screen.findByText('Edit Agent');
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(agentsApi.update).toHaveBeenCalledWith('1', expect.objectContaining({ name: 'SwagBot' }));
    });
  });

  it('deletes agent and navigates away', async () => {
    window.confirm = jest.fn().mockReturnValue(true);
    renderPage();
    await screen.findByText('SwagBot');
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect(agentsApi.delete).toHaveBeenCalledWith('1');
    });
    await screen.findByText('Agents List');
  });

  it('shows empty state when no associated prompts', async () => {
    agentsApi.get.mockResolvedValue({ data: { ...mockAgent, prompts: [] } });
    renderPage();
    expect(await screen.findByText('No prompts associated with this agent.')).toBeInTheDocument();
  });

  it('shows loading state before data arrives', () => {
    agentsApi.get.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
