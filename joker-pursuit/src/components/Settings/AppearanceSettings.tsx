import React, { useState } from 'react';
import './AppearanceSettings.css';

export type VisualTheme = 'modern' | 'parlor';

interface AppearanceSettingsProps {
  visualTheme: VisualTheme;
  onChangeTheme: (theme: VisualTheme) => void;
}

const THEMES: Array<{
  id: VisualTheme;
  label: string;
  description: string;
}> = [
  {
    id: 'modern',
    label: 'Modern',
    description: 'Clean glassy screens'
  },
  {
    id: 'parlor',
    label: 'Classic Parlor',
    description: 'Warm tabletop look'
  }
];

const AppearanceSettings: React.FC<AppearanceSettingsProps> = ({
  visualTheme,
  onChangeTheme
}) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="appearance-settings">
      <button
        type="button"
        className="appearance-trigger"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        data-testid="appearance-settings-trigger"
        onClick={() => setIsOpen(true)}
      >
        <span className="appearance-trigger-mark" aria-hidden="true"></span>
        <span>Appearance</span>
      </button>

      {isOpen && (
        <div
          className="appearance-backdrop"
          role="presentation"
          onClick={() => setIsOpen(false)}
        >
          <section
            className="appearance-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="appearance-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="appearance-panel-header">
              <div>
                <h2 id="appearance-title">Site Look</h2>
                <p>Choose the table style for menus and online play.</p>
              </div>
              <button
                type="button"
                className="appearance-close"
                aria-label="Close appearance settings"
                onClick={() => setIsOpen(false)}
              >
                x
              </button>
            </div>

            <div className="appearance-theme-options" role="radiogroup" aria-label="Site look">
              {THEMES.map(theme => (
                <button
                  key={theme.id}
                  type="button"
                  role="radio"
                  aria-checked={visualTheme === theme.id}
                  className={`appearance-theme-card ${visualTheme === theme.id ? 'selected' : ''} ${theme.id}`}
                  data-testid={`appearance-theme-${theme.id}`}
                  onClick={() => onChangeTheme(theme.id)}
                >
                  <span className="theme-card-preview" aria-hidden="true">
                    <span></span>
                    <span></span>
                    <span></span>
                  </span>
                  <span className="theme-card-copy">
                    <span className="theme-card-label">{theme.label}</span>
                    <span className="theme-card-description">{theme.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default AppearanceSettings;
