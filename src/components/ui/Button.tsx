import { motion } from 'framer-motion';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
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
      styles = { ...styles, background: 'var(--primary)', color: 'white', boxShadow: '0 0 15px var(--primary-glow)' };
    } else if (variant === 'secondary') {
      styles = { ...styles, background: 'var(--secondary)', color: 'black', boxShadow: '0 0 15px var(--secondary-glow)' };
    } else if (variant === 'outline') {
      styles = { ...styles, background: 'transparent', border: '1px solid var(--glass-border)', color: 'white' };
    }

    return styles;
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02, translateY: -2 }}
      whileTap={{ scale: 0.98 }}
      className={`btn-${variant} ${className}`}
      style={getStyles() as any}
      {...(props as any)}
    >
      {loading ? (
        <span className="spinner" style={{ width: '20px', height: '20px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
      ) : children}
    </motion.button>
  );
};
