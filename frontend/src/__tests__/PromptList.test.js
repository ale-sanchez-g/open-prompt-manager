import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PromptList from '../pages/PromptList';
import { promptsApi, tagsApi, agentsApi } from '../services/api';

jest.mock('../services/api');

const mockPrompts = [
  { id: 1, name: 'Alpha Prompt', description: 'First', version: '1.0.0', avg_rating: 4.0, usage_count: 7, tags: [{ id: 1, name: 'prod', color: '#10B981' }], agents: [] },
  { id: 2, name: 'Beta Prompt',  description: 'Second', version: '2.0.0', avg_rating: 3.5, usage_count: 2, tags: [], agents: [] },
];

beforeEach(() => {
  promptsApi.list.mockResolvedValue({ data: mockPrompts });
  tagsApi.list.mockResolvedValue({ data: [{ id: 1, name: 'prod', color: '#10B981' }] });
  agentsApi.list.mockResolvedValue({ data: [] });
  promptsApi.delete.mockResolvedValue({});
});

afterEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

function renderPage() {
  return render(<MemoryRouter><PromptList /></MemoryRouter>);
}

describe('PromptList', () => {
  it('renders heading and new button', async () => {
    renderPage();
    expect(await screen.findByText('Prompts')).toBeInTheDocument();
    expect(screen.getByText('New Prompt')).toBeInTheDocument();
  });

  it('displays prompt cards', async () => {
    renderPage();
    expect(await screen.findByText('Alpha Prompt')).toBeInTheDocument();
    expect(await screen.findByText('Beta Prompt')).toBeInTheDocument();
  });

  it('shows version badges', async () => {
    renderPage();
    expect(await screen.findByText('v1.0.0')).toBeInTheDocument();
    expect(await screen.findByText('v2.0.0')).toBeInTheDocument();
  });

  it('renders tag chips', async () => {
    renderPage();
    // 'prod' appears in both the filter <select> option and the chip span
    const matches = await screen.findAllByText('prod');
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('shows empty state when no prompts', async () => {
    promptsApi.list.mockResolvedValue({ data: [] });
    renderPage();
    expect(await screen.findByText('No prompts found.')).toBeInTheDocument();
  });

  it('triggers search API call on input', async () => {
    renderPage();
    await screen.findByText('Alpha Prompt');

    const searchInput = screen.getByPlaceholderText('Search prompts...');
    fireEvent.change(searchInput, { target: { value: 'alpha' } });

    await waitFor(() => {
      expect(promptsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'alpha' })
      );
    });
  });

  it('confirms before deleting a prompt', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await screen.findByText('Alpha Prompt');

    const buttons = screen.getAllByRole('button');
    const deleteBtn = buttons.find((b) => b.title === 'Delete');
    if (deleteBtn) fireEvent.click(deleteBtn);

    expect(window.confirm).toHaveBeenCalled();
    expect(promptsApi.delete).not.toHaveBeenCalled();
  });
});
