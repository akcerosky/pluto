import { motion, type HTMLMotionProps } from 'framer-motion';
import type { CSSProperties } from 'react';

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  style?: CSSProperties;
}

export const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  loading, 
  className = '', 
  style = {},
  ...props 
}: ButtonProps) => {
  
  const getStyles = () => {
    let styles: React.CSSProperties = {
      padding: size === 'sm' ? '8px 16px' : size === 'lg' ? '16px 32px' : '12px 24px',
      fontSize: size === 'sm' ? '14px' : size === 'lg' ? '18px' : '16px',
      borderRadius: 'var(--radius-md)',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: '600',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      cursor: 'pointer',
      border: 'none',
      ...style
    };

    if (variant === 'primary') {
      styles = {
        ...styles,
        background: 'var(--brand-gradient)',
        color: 'var(--user-bubble-text)',
        boxShadow: 'var(--panel-shadow)',
      };
    } else if (variant === 'secondary') {
      styles = {
        ...styles,
        background: 'var(--surface-2)',
        color: 'var(--text-primary)',
        border: '1px solid var(--border-color)',
      };
    } else if (variant === 'outline') {
      styles = {
        ...styles,
        background: 'transparent',
        border: '1px solid var(--glass-border)',
        color: 'var(--text-primary)',
      };
    } else if (variant === 'ghost') {
      styles = {
        ...styles,
        background: 'transparent',
        color: 'var(--text-secondary)',
      };
    }

    return styles;
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02, translateY: -2 }}
      whileTap={{ scale: 0.98 }}
      className={`btn-${variant} ${className}`}
      style={getStyles()}
      {...props}
    >
      {loading ? (
        <span className="spinner" />
      ) : children}
    </motion.button>
  );
};
