import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';
import { promptsApi, tagsApi, agentsApi } from '../services/api';

jest.mock('../services/api');

const mockPrompts = [
  { id: 1, name: 'Prompt A', version: '1.0.0', avg_rating: 4.5, usage_count: 10, tags: [], agents: [] },
  { id: 2, name: 'Prompt B', version: '1.0.1', avg_rating: 3.0, usage_count: 5,  tags: [], agents: [] },
];
const mockTags = [
  { id: 1, name: 'production', color: '#10B981' },
];
const mockAgents = [
  { id: 1, name: 'Bot A', status: 'active' },
  { id: 2, name: 'Bot B', status: 'inactive' },
];

beforeEach(() => {
  promptsApi.list.mockResolvedValue({ data: mockPrompts });
  tagsApi.list.mockResolvedValue({ data: mockTags });
  agentsApi.list.mockResolvedValue({ data: mockAgents });
});

afterEach(() => jest.clearAllMocks());

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

describe('Dashboard', () => {
  it('renders the heading', async () => {
    renderDashboard();
    expect(await screen.findByText('Dashboard')).toBeInTheDocument();
  });

  it('shows prompt count stat', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Total Prompts')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('shows tag count stat', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Tags')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
    });
  });

  it('shows agent count stat', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Agents')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('lists recent prompts by name', async () => {
    renderDashboard();
    expect(await screen.findByText('Prompt A')).toBeInTheDocument();
    expect(await screen.findByText('Prompt B')).toBeInTheDocument();
  });

  it('shows total executions', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('Total Executions')).toBeInTheDocument();
      expect(screen.getByText('15')).toBeInTheDocument(); // 10 + 5
    });
  });

  it('renders View all link', async () => {
    renderDashboard();
    expect(await screen.findByText('View all')).toBeInTheDocument();
  });

  it('shows empty state when no prompts', async () => {
    promptsApi.list.mockResolvedValue({ data: [] });
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText('No prompts yet.')).toBeInTheDocument();
    });
  });
});
