import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TagsManagement from '../pages/TagsManagement';
import { tagsApi } from '../services/api';

jest.mock('../services/api');

const mockTags = [
  { id: 1, name: 'production', color: '#10B981' },
  { id: 2, name: 'beta',       color: '#F59E0B' },
];

beforeEach(() => {
  tagsApi.list.mockResolvedValue({ data: mockTags });
  tagsApi.create.mockResolvedValue({ data: { id: 3, name: 'new-tag', color: '#3B82F6' } });
  tagsApi.delete.mockResolvedValue({});
});

afterEach(() => jest.clearAllMocks());

function renderPage() {
  return render(<MemoryRouter><TagsManagement /></MemoryRouter>);
}

describe('TagsManagement', () => {
  it('renders page heading', async () => {
    renderPage();
    expect(await screen.findByText('Tags')).toBeInTheDocument();
  });

  it('lists existing tags', async () => {
    renderPage();
    expect(await screen.findByText('production')).toBeInTheDocument();
    expect(await screen.findByText('beta')).toBeInTheDocument();
  });

  it('shows tag count', async () => {
    renderPage();
    expect(await screen.findByText('All Tags (2)')).toBeInTheDocument();
  });

  it('submits create tag form', async () => {
    tagsApi.list
      .mockResolvedValueOnce({ data: mockTags })
      .mockResolvedValueOnce({ data: [...mockTags, { id: 3, name: 'new-tag', color: '#3B82F6' }] });

    renderPage();
    await screen.findByText('production');

    fireEvent.change(screen.getByPlaceholderText(''), { target: { value: 'new-tag' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => {
      expect(tagsApi.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'new-tag' })
      );
    });
  });

  it('calls delete when trash button clicked and confirmed', async () => {
    window.confirm = jest.fn(() => true);
    renderPage();
    await screen.findByText('production');

    const deleteButtons = screen.getAllByTitle
      ? screen.queryAllByRole('button')
      : [];
    // Find delete buttons via SVG icons — use getAllByRole for buttons
    const buttons = screen.getAllByRole('button');
    // Last two buttons are the delete buttons for each tag
    fireEvent.click(buttons[buttons.length - 1]);

    await waitFor(() => {
      expect(tagsApi.delete).toHaveBeenCalled();
    });
  });
});
