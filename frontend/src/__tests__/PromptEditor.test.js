import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PromptEditor from '../pages/PromptEditor';
import { promptsApi, tagsApi, agentsApi } from '../services/api';

jest.mock('../services/api');

const mockPrompt = {
  id: 2,
  name: 'Sales Pitch Generator',
  description: 'Generate compelling sales pitches.',
  content: 'Pitch for {{prospect_name}} at {{company}}.',
  version: '1.0.0',
  created_by: '',
  variables: [{ name: 'prospect_name', type: 'string', required: false, description: '' }],
  tags: [{ id: 1, name: 'Sales', color: '#F59E0B' }],
  agents: [],
};

const mockTags = [{ id: 1, name: 'Sales', color: '#F59E0B' }];
const mockAgents = [{ id: 1, name: 'Sales Agent', status: 'active', created_at: '2024-01-01T00:00:00' }];

beforeEach(() => {
  tagsApi.list.mockResolvedValue({ data: mockTags });
  agentsApi.list.mockResolvedValue({ data: mockAgents });
  promptsApi.get.mockResolvedValue({ data: mockPrompt });
  promptsApi.create.mockResolvedValue({ data: { ...mockPrompt, id: 10 } });
  promptsApi.update.mockResolvedValue({ data: mockPrompt });
  promptsApi.createVersion.mockResolvedValue({ data: { ...mockPrompt, id: 5, version: '1.0.1' } });
});

afterEach(() => jest.clearAllMocks());

function renderEditor(path = '/prompts/new') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/prompts/new" element={<PromptEditor />} />
        <Route path="/prompts/:id/edit" element={<PromptEditor />} />
        <Route path="/prompts/:id" element={<div>Prompt Detail</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ── New prompt mode ──────────────────────────────────────────────────────────

describe('PromptEditor — new prompt mode', () => {
  it('renders "New Prompt" heading', () => {
    renderEditor('/prompts/new');
    expect(screen.getByText('New Prompt')).toBeInTheDocument();
  });

  it('renders Create Prompt button', () => {
    renderEditor('/prompts/new');
    expect(screen.getByRole('button', { name: /create prompt/i })).toBeInTheDocument();
  });

  it('calls promptsApi.create on submit (no version modal)', async () => {
    renderEditor('/prompts/new');
    fireEvent.change(screen.getByPlaceholderText(/use \{\{variable_name\}\}/i), {
      target: { value: 'Hello world' },
    });
    // Fill required Name field
    const nameInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(nameInput, { target: { value: 'My Prompt' } });

    fireEvent.click(screen.getByRole('button', { name: /create prompt/i }));

    await waitFor(() => {
      expect(promptsApi.create).toHaveBeenCalledTimes(1);
    });
    // Version modal must NOT appear
    expect(screen.queryByText('Update Version?')).not.toBeInTheDocument();
  });
});

// ── Edit prompt mode ─────────────────────────────────────────────────────────

describe('PromptEditor — edit mode version popup', () => {
  it('renders "Edit Prompt" heading after loading', async () => {
    renderEditor('/prompts/2/edit');
    expect(await screen.findByText('Edit Prompt')).toBeInTheDocument();
  });

  it('pre-populates form with existing prompt data', async () => {
    renderEditor('/prompts/2/edit');
    expect(await screen.findByDisplayValue('Sales Pitch Generator')).toBeInTheDocument();
    expect(screen.getByDisplayValue('1.0.0')).toBeInTheDocument();
  });

  it('shows version modal when Save Changes is clicked', async () => {
    renderEditor('/prompts/2/edit');
    await screen.findByText('Edit Prompt');

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(await screen.findByText('Update Version?')).toBeInTheDocument();
    expect(screen.getByText(/would you like to bump the version from/i)).toBeInTheDocument();
    expect(screen.getAllByText(/1\.0\.0/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1\.0\.1/).length).toBeGreaterThanOrEqual(1);
  });

  it('displays three choices: bump, keep, cancel', async () => {
    renderEditor('/prompts/2/edit');
    await screen.findByText('Edit Prompt');

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByText('Update Version?');

    const modal = screen.getByRole('heading', { name: 'Update Version?' }).closest('div');
    expect(within(modal).getByRole('button', { name: /yes, bump to 1\.0\.1/i })).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: /no, keep version 1\.0\.0/i })).toBeInTheDocument();
    expect(within(modal).getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
  });

  it('"Cancel" in modal dismisses it without saving', async () => {
    renderEditor('/prompts/2/edit');
    await screen.findByText('Edit Prompt');

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByText('Update Version?');

    const modal = screen.getByRole('heading', { name: 'Update Version?' }).closest('div');
    fireEvent.click(within(modal).getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByText('Update Version?')).not.toBeInTheDocument();
    });
    expect(promptsApi.update).not.toHaveBeenCalled();
    expect(promptsApi.createVersion).not.toHaveBeenCalled();
  });

  it('"No, keep version" calls promptsApi.update with original form data', async () => {
    renderEditor('/prompts/2/edit');
    await screen.findByText('Edit Prompt');

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByText('Update Version?');

    fireEvent.click(screen.getByRole('button', { name: /no, keep version/i }));

    await waitFor(() => {
      expect(promptsApi.update).toHaveBeenCalledWith(
        '2',
        expect.objectContaining({ name: 'Sales Pitch Generator', version: '1.0.0' })
      );
    });
    expect(promptsApi.createVersion).not.toHaveBeenCalled();
  });

  it('"Yes, bump" calls promptsApi.createVersion with form content', async () => {
    renderEditor('/prompts/2/edit');
    await screen.findByText('Edit Prompt');

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByText('Update Version?');

    fireEvent.click(screen.getByRole('button', { name: /yes, bump to 1\.0\.1/i }));

    await waitFor(() => {
      expect(promptsApi.createVersion).toHaveBeenCalledWith(
        '2',
        expect.objectContaining({
          content: mockPrompt.content,
          description: mockPrompt.description,
        })
      );
    });
    expect(promptsApi.update).not.toHaveBeenCalled();
  });

  it('shows error message when save fails', async () => {
    promptsApi.update.mockRejectedValue({ response: { data: { detail: 'Server error' } } });
    renderEditor('/prompts/2/edit');
    await screen.findByText('Edit Prompt');

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByText('Update Version?');
    fireEvent.click(screen.getByRole('button', { name: /no, keep version/i }));

    expect(await screen.findByText('Server error')).toBeInTheDocument();
  });

  it('bumpPatchVersion handles non-semver gracefully', async () => {
    promptsApi.get.mockResolvedValue({ data: { ...mockPrompt, version: 'v2' } });
    renderEditor('/prompts/2/edit');
    await screen.findByText('Edit Prompt');

    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await screen.findByText('Update Version?');

    // Version cannot be bumped, so modal still shows original
    expect(screen.getAllByText(/v2/).length).toBeGreaterThanOrEqual(1);
  });
});
