import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Button from '../components/Button';

describe('Button', () => {
  it('renders children and fires onClick', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Create</Button>);
    const btn = screen.getByRole('button', { name: 'Create' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('defaults to type="button" to avoid accidental form submits', () => {
    render(<Button>Go</Button>);
    expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'button');
  });

  it('applies variant and size classes', () => {
    render(<Button variant="danger" size="sm">Delete</Button>);
    const btn = screen.getByRole('button', { name: 'Delete' });
    expect(btn.className).toContain('bg-red-700');
    expect(btn.className).toContain('px-3');
  });

  it('can be disabled', () => {
    render(<Button disabled>Nope</Button>);
    expect(screen.getByRole('button', { name: 'Nope' })).toBeDisabled();
  });

  it('renders a leading icon', () => {
    render(<Button icon={<svg data-testid="icon" />}>With icon</Button>);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});
