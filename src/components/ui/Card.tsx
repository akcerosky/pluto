import { motion } from 'framer-motion';
import React from 'react';

export const Card = ({ 
  children, 
  className = '', 
  animate = true,
  style = {} 
}: { 
  children: React.ReactNode, 
  className?: string, 
  animate?: boolean,
  style?: React.CSSProperties
}) => {
  const Component = animate ? motion.div : 'div';
  
  const baseStyle: React.CSSProperties = {
    borderRadius: 'var(--radius-lg)',
    padding: 'var(--spacing-lg)',
    width: '100%',
    ...style
  };

  return (
    <Component
      initial={animate ? { opacity: 0, y: 20 } : undefined}
      animate={animate ? { opacity: 1, y: 0 } : undefined}
      className={`glass-morphism ${className}`}
      style={baseStyle}
    >
      {children}
    </Component>
  );
};
