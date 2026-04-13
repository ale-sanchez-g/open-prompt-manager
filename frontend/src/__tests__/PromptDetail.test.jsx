import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PromptDetail from '../pages/PromptDetail';
import { promptsApi, healthApi } from '../services/api';

jest.mock('../services/api');

const mockPromptV1 = {
  id: 2,
  name: 'Sales Pitch Generator',
  description: 'Generate compelling sales pitches.',
  content: 'Pitch for {{prospect_name}} at {{company}}.',
  version: '1.0.0',
  created_by: '',
  variables: [{ name: 'prospect_name', type: 'string', required: false, description: '', default: null }],
  tags: [{ id: 1, name: 'Sales', color: '#F59E0B' }],
  agents: [],
  avg_rating: 0.0,
  usage_count: 0,
  success_rate: 0.0,
  created_at: '2026-03-13T00:00:00',
  updated_at: '2026-03-13T00:00:00',
};

const mockPromptV2 = {
  ...mockPromptV1,
  id: 4,
  version: '1.0.1',
  content: 'Pitch for {{prospect_name}} at {{company}}.\nHighlight ROI and include a call-to-action.',
};

// Version history includes both v1.0.0 and v1.0.1
const mockVersions = [
  { id: 2, name: 'Sales Pitch Generator', version: '1.0.0', is_latest: false },
  { id: 4, name: 'Sales Pitch Generator', version: '1.0.1', is_latest: true },
];

beforeEach(() => {
  promptsApi.get.mockImplementation((id) => {
    if (String(id) === '4') return Promise.resolve({ data: mockPromptV2 });
    return Promise.resolve({ data: mockPromptV1 });
  });
  promptsApi.getVersions.mockResolvedValue({ data: mockVersions });
  promptsApi.delete.mockResolvedValue({});
  promptsApi.render.mockResolvedValue({ data: { rendered_content: 'Rendered output' } });
  healthApi.check = jest.fn().mockResolvedValue({ data: { version: '1.0.0' } });
});

afterEach(() => jest.clearAllMocks());

function renderDetail(id = '4') {
  return render(
    <MemoryRouter initialEntries={[`/prompts/${id}`]}>
      <Routes>
        <Route path="/prompts/:id" element={<PromptDetail />} />
        <Route path="/prompts" element={<div>Prompts List</div>} />
      </Routes>
    </MemoryRouter>
  );
}

// ── computeLineDiff logic (via UI) ───────────────────────────────────────────

describe('PromptDetail — version diff', () => {
  it('renders Version History section with compare button for older version', async () => {
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    // v1.0.0 should have a compare button; v1.0.1 (current) should not
    expect(screen.getByRole('button', { name: /compare v1\.0\.0.*v1\.0\.1/i })).toBeInTheDocument();
  });

  it('shows a "Latest" badge only on the most recent version', async () => {
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    // Only one "Latest" badge should appear and it should be present
    const latestBadges = await screen.findAllByText('Latest');
    expect(latestBadges).toHaveLength(1);
  });

  it('displays version history with proper styling', async () => {
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    // Verify the version history section renders
    const versionHistorySection = await screen.findByText('Version History');
    expect(versionHistorySection).toBeInTheDocument();
    
    // Verify version badges are displayed
    const versionBadges = await screen.findAllByText(/v1\.0\./);
    expect(versionBadges.length).toBeGreaterThan(0);
  });

  it('does not render a compare button for the current version', async () => {
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    const compareButtons = screen.queryAllByRole('button', { name: /compare v1\.0\.1/i });
    expect(compareButtons).toHaveLength(0);
  });

  it('opens diff modal when compare button is clicked', async () => {
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    fireEvent.click(screen.getByRole('button', { name: /compare v1\.0\.0.*v1\.0\.1/i }));

    expect(await screen.findByText(/diff:.*v1\.0\.0.*v1\.0\.1/i)).toBeInTheDocument();
  });

  it('fetches the older prompt version to compare against', async () => {
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    fireEvent.click(screen.getByRole('button', { name: /compare v1\.0\.0.*v1\.0\.1/i }));

    await waitFor(() => {
      expect(promptsApi.get).toHaveBeenCalledWith(2);
    });
  });

  it('shows removed lines (−) and added lines (+) in the diff', async () => {
    // Override mock with content that produces both removals and additions
    promptsApi.get.mockImplementation((id) => {
      if (String(id) === '4')
        return Promise.resolve({ data: { ...mockPromptV2, content: 'new content here' } });
      return Promise.resolve({ data: { ...mockPromptV1, content: 'old content here' } });
    });

    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    fireEvent.click(screen.getByRole('button', { name: /compare v1\.0\.0.*v1\.0\.1/i }));
    await screen.findByText(/diff:/i);

    // Should have at least one − marker and one + marker (spans with exact marker characters)
    expect((await screen.findAllByText('−')).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('+').length).toBeGreaterThanOrEqual(1);
  });

  it('displays change count in modal header', async () => {
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    fireEvent.click(screen.getByRole('button', { name: /compare v1\.0\.0.*v1\.0\.1/i }));
    await screen.findByText(/diff:/i);

    // "N change(s)" should appear
    expect(screen.getByText(/change\(s\)/i)).toBeInTheDocument();
  });

  it('shows "No differences" message when content is identical', async () => {
    // Make both versions return identical content
    promptsApi.get.mockResolvedValue({ data: mockPromptV2 });
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    fireEvent.click(screen.getByRole('button', { name: /compare v1\.0\.0.*v1\.0\.1/i }));
    await screen.findByText(/diff:/i);

    expect(await screen.findByText(/no differences found/i)).toBeInTheDocument();
  });

  it('shows the audit footer with version range and timestamp', async () => {
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    fireEvent.click(screen.getByRole('button', { name: /compare v1\.0\.0.*v1\.0\.1/i }));

    expect(await screen.findByText(/diff:/i)).toBeInTheDocument();

    expect(await screen.findByText(/audit comparison.*v1\.0\.0.*v1\.0\.1/i)).toBeInTheDocument();
    expect(screen.getByText(/generated:/i)).toBeInTheDocument();
  });

  it('closes diff modal when × button is clicked', async () => {
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    fireEvent.click(screen.getByRole('button', { name: /compare v1\.0\.0.*v1\.0\.1/i }));
    const diffHeader = await screen.findByText(/diff:/i);
    expect(diffHeader).toBeInTheDocument();

    // The close button is a sibling of the inner flex div inside the modal header row
    const modalHeader = diffHeader.closest('div').parentElement;
    const closeBtn = modalHeader.querySelector('button');
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByText(/diff:.*v1\.0\.0.*v1\.0\.1/i)).not.toBeInTheDocument();
    });
  });

  it('shows legend labels in modal', async () => {
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    fireEvent.click(screen.getByRole('button', { name: /compare v1\.0\.0.*v1\.0\.1/i }));
    await screen.findByText(/diff:/i);

    expect(await screen.findByText(/removed from v1\.0\.0/i)).toBeInTheDocument();
    expect(screen.getByText(/added in v1\.0\.1/i)).toBeInTheDocument();
    expect(screen.getByText(/unchanged/i)).toBeInTheDocument();
  });
});

// ── computeLineDiff unit tests (via exported logic, tested through component) ─

describe('computeLineDiff logic (integrated)', () => {
  it('identical single-line texts produce 0 changes', async () => {
    // Both the current prompt AND the fetched older version return identical content
    const sameContent = 'same content line';
    promptsApi.get.mockResolvedValue({
      data: { ...mockPromptV2, content: sameContent },
    });
    promptsApi.getVersions.mockResolvedValue({ data: mockVersions });

    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    fireEvent.click(screen.getByRole('button', { name: /compare v1\.0\.0.*v1\.0\.1/i }));
    await screen.findByText(/diff:/i);

    expect(screen.getByText(/0 change\(s\)/i)).toBeInTheDocument();
  });

  it('adding a new line shows 1 addition', async () => {
    promptsApi.get.mockImplementation((id) => {
      if (String(id) === '4')
        return Promise.resolve({ data: { ...mockPromptV2, content: 'line one\nline two' } });
      // The "older" version (id=2) has only one line
      return Promise.resolve({ data: { ...mockPromptV1, content: 'line one' } });
    });

    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    fireEvent.click(screen.getByRole('button', { name: /compare v1\.0\.0.*v1\.0\.1/i }));
    await screen.findByText(/diff:/i);

    expect(await screen.findByText('line two')).toBeInTheDocument();
    expect(screen.getAllByText('+').length).toBeGreaterThanOrEqual(1);
  });
});

// ── Components sidebar card ───────────────────────────────────────────────────

describe('PromptDetail — Components sidebar card', () => {
  const mockComponentPrompt = {
    id: 99,
    name: 'Shared Intro Block',
    version: '1.0.0',
    content: 'Hello there.',
    description: '',
    variables: [],
    tags: [],
    agents: [],
    avg_rating: 0.0,
    usage_count: 0,
    success_rate: 0.0,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  };

  it('does not show Components card when content has no component references', async () => {
    // mockPromptV2 content has no {{component:...}} references
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });
    expect(screen.queryByText('Components')).not.toBeInTheDocument();
  });

  it('shows Components card when content contains a {{component:id}} reference', async () => {
    promptsApi.get.mockImplementation((id) => {
      if (String(id) === '99') return Promise.resolve({ data: mockComponentPrompt });
      return Promise.resolve({
        data: { ...mockPromptV2, content: 'Intro: {{component:99}} then pitch.' },
      });
    });

    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });
    expect(await screen.findByText('Components')).toBeInTheDocument();
    expect(await screen.findByText('Shared Intro Block')).toBeInTheDocument();
  });

  it('renders component as a link to its detail page', async () => {
    promptsApi.get.mockImplementation((id) => {
      if (String(id) === '99') return Promise.resolve({ data: mockComponentPrompt });
      return Promise.resolve({
        data: { ...mockPromptV2, content: '{{component:99}}' },
      });
    });

    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });
    const link = await screen.findByRole('link', { name: /shared intro block/i });
    expect(link).toHaveAttribute('href', '/prompts/99');
  });

  it('displays version label for each component', async () => {
    promptsApi.get.mockImplementation((id) => {
      if (String(id) === '99') return Promise.resolve({ data: mockComponentPrompt });
      return Promise.resolve({
        data: { ...mockPromptV2, content: '{{component:99}}' },
      });
    });

    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });
    await screen.findByText('Shared Intro Block');
    expect(screen.getAllByText('v1.0.0').length).toBeGreaterThanOrEqual(1);
  });

  it('fetches each referenced component prompt via promptsApi.get', async () => {
    promptsApi.get.mockImplementation((id) => {
      if (String(id) === '99') return Promise.resolve({ data: mockComponentPrompt });
      return Promise.resolve({
        data: { ...mockPromptV2, content: '{{component:99}}' },
      });
    });

    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });
    await waitFor(() => {
      expect(promptsApi.get).toHaveBeenCalledWith(99);
    });
  });
});

describe('PromptDetail — component variable merging in Test Rendering', () => {
  const mockComponentWithVars = {
    id: 99,
    name: 'Persona Block',
    version: '1.0.0',
    content: 'You are {{persona}}.',
    description: '',
    variables: [
      { name: 'persona', type: 'string', required: true, description: 'Agent persona', default: null },
    ],
    tags: [],
    agents: [],
    avg_rating: 0.0,
    usage_count: 0,
    success_rate: 0.0,
    created_at: '2026-01-01T00:00:00',
    updated_at: '2026-01-01T00:00:00',
  };

  const mockParentWithComponent = {
    ...mockPromptV2,
    content: '{{component:99}}\nYou must look for bugs in {{system}}.',
    variables: [
      { name: 'system', type: 'string', required: true, description: 'Application under test', default: null },
    ],
  };

  beforeEach(() => {
    promptsApi.get.mockImplementation((id) => {
      if (String(id) === '99') return Promise.resolve({ data: mockComponentWithVars });
      return Promise.resolve({ data: mockParentWithComponent });
    });
    promptsApi.getVersions.mockResolvedValue({ data: mockVersions });
  });

  it('shows input fields for both parent and component variables in Test Rendering', async () => {
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });
    // Wait for component variables to be merged in
    await waitFor(() => {
      expect(screen.getByLabelText(/system/i, { selector: 'input' })).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/persona/i, { selector: 'input' })).toBeInTheDocument();
  });

  it('labels component-sourced variable with its component name', async () => {
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });
    await waitFor(() => {
      expect(screen.getAllByText(/from: Persona Block/i).length).toBeGreaterThanOrEqual(1);
    });
  });

  it('includes component variable values in render API call', async () => {
    promptsApi.render.mockResolvedValue({ data: { rendered_content: 'Rendered' } });
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });

    // Wait for both inputs to appear
    const systemInput = await screen.findByLabelText(/system/i, { selector: 'input' });
    const personaInput = await screen.findByLabelText(/persona/i, { selector: 'input' });

    fireEvent.change(systemInput, { target: { value: 'opm' } });
    fireEvent.change(personaInput, { target: { value: 'expert' } });

    fireEvent.click(screen.getByRole('button', { name: /render/i }));
    await waitFor(() => {
      expect(promptsApi.render).toHaveBeenCalledWith(
        '4',
        expect.objectContaining({ system: 'opm', persona: 'expert' }),
      );
    });
  });

  it('does not duplicate variables when parent and component share the same variable name', async () => {
    const sharedVarComponent = {
      ...mockComponentWithVars,
      variables: [
        { name: 'system', type: 'string', required: false, description: 'Shared', default: null },
      ],
    };
    promptsApi.get.mockImplementation((id) => {
      if (String(id) === '99') return Promise.resolve({ data: sharedVarComponent });
      return Promise.resolve({ data: mockParentWithComponent });
    });

    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });
    await waitFor(() => {
      expect(screen.getAllByLabelText(/system/i, { selector: 'input' })).toHaveLength(1);
    });
  });

  it('shows component variable in sidebar Variables card', async () => {
    renderDetail('4');
    await screen.findByRole('heading', { name: 'Sales Pitch Generator' });
    // persona should appear in the sidebar Variables list
    await waitFor(() => {
      expect(screen.getAllByText(/\{\{persona\}\}/).length).toBeGreaterThanOrEqual(1);
    });
  });
});
