import React from 'react';
import PropTypes from 'prop-types';

/**
 * Badge — a small pill/label used for statuses, version tags, and category chips.
 *
 * Use a named `tone` for the common semantic colours, or pass `className`/`style`
 * for custom colours (e.g. a user-defined tag colour).
 */
const TONES = {
  gray: 'bg-gray-700 text-gray-400',
  green: 'bg-green-900 text-green-300',
  red: 'bg-red-900 text-red-300',
  blue: 'bg-blue-900 text-blue-300',
  purple: 'bg-purple-900 text-purple-300',
  yellow: 'bg-yellow-900 text-yellow-300',
};

const SIZES = {
  sm: 'px-2 py-0.5',
  md: 'px-3 py-1',
};

// Maps a domain status string to a Badge tone.
const STATUS_TONE = { active: 'green', inactive: 'gray', deprecated: 'red', error: 'red' };

export default function Badge({ children = null, tone, size = 'sm', className = '', style, ...rest }) {
  const toneClass = tone ? TONES[tone] || '' : '';
  return (
    <span
      className={`inline-flex items-center rounded-full text-xs font-medium ${SIZES[size]} ${toneClass} ${className}`.replace(/\s+/g, ' ').trim()}
      style={style}
      {...rest}
    >
      {children}
    </span>
  );
}

/** Resolve a domain status (e.g. an agent's status) to a Badge tone. */
Badge.statusTone = (status) => STATUS_TONE[status] || 'gray';

Badge.propTypes = {
  children: PropTypes.node,
  /** Named semantic colour. Omit when supplying a custom colour via className/style. */
  tone: PropTypes.oneOf(['gray', 'green', 'red', 'blue', 'purple', 'yellow']),
  /** Padding size. */
  size: PropTypes.oneOf(['sm', 'md']),
  className: PropTypes.string,
  style: PropTypes.object,
};
