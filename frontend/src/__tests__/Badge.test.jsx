import React from 'react';
import { render, screen } from '@testing-library/react';
import Badge from '../components/Badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>active</Badge>);
    expect(screen.getByText('active')).toBeInTheDocument();
  });

  it('applies the tone colour classes', () => {
    render(<Badge tone="green">active</Badge>);
    expect(screen.getByText('active').className).toContain('bg-green-900');
  });

  it('supports a custom colour via style and className', () => {
    render(<Badge className="text-white" style={{ backgroundColor: '#abc' }}>Sales</Badge>);
    const el = screen.getByText('Sales');
    expect(el.className).toContain('text-white');
    expect(el).toHaveStyle({ backgroundColor: '#abc' });
  });

  it('maps domain statuses to tones', () => {
    expect(Badge.statusTone('active')).toBe('green');
    expect(Badge.statusTone('inactive')).toBe('gray');
    expect(Badge.statusTone('deprecated')).toBe('red');
    expect(Badge.statusTone('whatever')).toBe('gray');
  });
});
