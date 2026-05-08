import { useTheme } from '../context/useTheme';
import type { PlutoThemePreference } from '../context/themeContextValue';

interface ThemeToggleProps {
  label?: string;
  className?: string;
}

const OPTIONS: Array<{ value: PlutoThemePreference; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'white', label: 'White' },
  { value: 'black', label: 'Black' },
];

export const ThemeToggle = ({
  label = 'Select theme',
  className = '',
}: ThemeToggleProps) => {
  const { preference, setThemePreference } = useTheme();

  return (
    <div
      className={`theme-toggle ${className}`.trim()}
      role="group"
      aria-label={label}
    >
      {OPTIONS.map((option) => {
        const isActive = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            className={`theme-toggle-segment ${isActive ? 'active' : ''}`.trim()}
            onClick={() => setThemePreference(option.value)}
            aria-pressed={isActive}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
};
