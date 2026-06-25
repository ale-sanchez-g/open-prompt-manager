import React from 'react';
import PropTypes from 'prop-types';

/**
 * Button — the shared button primitive.
 *
 * Encapsulates the app's Tailwind button variants/sizes so pages compose a
 * consistent control instead of repeating utility-class strings. Forwards all
 * other props (onClick, disabled, type, aria-*, etc.) to the underlying button.
 */
const VARIANTS = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  secondary: 'bg-gray-700 hover:bg-gray-600 text-white',
  danger: 'bg-red-700 hover:bg-red-600 text-white',
  success: 'bg-green-600 hover:bg-green-700 text-white',
  ghost: 'text-gray-400 hover:text-white',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  icon = null,
  type = 'button',
  className = '',
  children = null,
  ...rest
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`.replace(/\s+/g, ' ').trim()}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

Button.propTypes = {
  /** Visual style. */
  variant: PropTypes.oneOf(['primary', 'secondary', 'danger', 'success', 'ghost']),
  /** Padding/text size. */
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  /** Optional leading icon element. */
  icon: PropTypes.node,
  /** Button type; defaults to "button" to avoid accidental form submits. */
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
  className: PropTypes.string,
  children: PropTypes.node,
};
