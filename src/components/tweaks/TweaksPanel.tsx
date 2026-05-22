import { useState } from 'react';
import { useStore } from '../../store';
import { Icon } from '../Icon';

/**
 * Lightweight tweaks panel — fixed bottom-right. Settings stored in the
 * store, so they persist via the persist middleware.
 */
export function TweaksPanel() {
  const tweaks = useStore((s) => s.tweaks);
  const setTweak = useStore((s) => s.setTweak);
  const [open, setOpen] = useState(false);

  return (
    <div className={'tweaks-panel' + (open ? ' open' : '')}>
      <button className="tweaks-toggle" onClick={() => setOpen((o) => !o)} title="Tweaks">
        <Icon name="settings_2" size={14} />
      </button>
      {open && (
        <div className="tweaks-body">
          <div className="tweaks-section">
            <div className="tweaks-section-title">Layout</div>
            <div className="tweak-row">
              <span>Density</span>
              <div className="tweak-radio">
                {(['cozy', 'compact'] as const).map((d) => (
                  <button
                    key={d}
                    className={tweaks.density === d ? 'active' : ''}
                    onClick={() => setTweak('density', d)}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="tweak-row">
              <span>Drive-time overlay</span>
              <button
                className={'tweak-toggle' + (tweaks.showDriveTime ? ' on' : '')}
                onClick={() => setTweak('showDriveTime', !tweaks.showDriveTime)}
              >
                <span className="tweak-toggle-dot" />
              </button>
            </div>
          </div>
          <div className="tweaks-section">
            <div className="tweaks-section-title">Theme</div>
            <div className="tweak-row">
              <span>Accent</span>
              <div className="tweak-color-row">
                {[
                  { id: 'green', swatch: ['#3CD567', '#0F1F0D', '#CBFF8A'] },
                  { id: 'forest', swatch: ['#113823', '#3CD567', '#FBFAF1'] },
                  { id: 'amber', swatch: ['#FFB627', '#0F1F0D', '#3CD567'] },
                ].map(({ id, swatch }) => (
                  <button
                    key={id}
                    className={'tweak-color-swatch' + (tweaks.accent === id ? ' active' : '')}
                    onClick={() => setTweak('accent', id)}
                    title={id}
                  >
                    {swatch.map((c, i) => (
                      <span key={i} style={{ background: c }} />
                    ))}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
