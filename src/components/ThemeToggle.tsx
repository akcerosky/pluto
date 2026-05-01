import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../context/useTheme';

interface ThemeToggleProps {
  label?: string;
  className?: string;
}

export const ThemeToggle = ({
  label = 'Toggle theme',
  className = '',
}: ThemeToggleProps) => {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`.trim()}
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        {isDark ? <Sun size={16} /> : <Moon size={16} />}
      </span>
      <span className="theme-toggle-label">{isDark ? 'Light mode' : 'Dark mode'}</span>
    </button>
  );
};
