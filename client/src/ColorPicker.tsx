import type { CSSProperties } from 'react';
import { PLAYER_COLORS, type PlayerColorId } from '@custom-tabletop/shared';
import { CHARACTER_TITLES } from './characterTitles.js';

export interface ColorPickerProps {
  value: PlayerColorId;
  /** Colors worn by *other* players — shown but not selectable. */
  taken: ReadonlySet<PlayerColorId>;
  onChange: (color: PlayerColorId) => void;
  label: string;
}

/**
 * The six player-color swatches (shared/src/player.ts's PLAYER_COLORS) as a
 * radio group — used on the join screen and in the in-session profile
 * editor, so picking a color looks and behaves the same in both places.
 */
export function ColorPicker({ value, taken, onChange, label }: ColorPickerProps) {
  return (
    <div className="color-picker" role="radiogroup" aria-label={label}>
      {PLAYER_COLORS.map((color) => {
        const isTaken = taken.has(color.id) && color.id !== value;
        const selected = color.id === value;
        return (
          <button
            key={color.id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={isTaken ? `${color.label} (taken)` : color.label}
            title={`${color.label} — ${CHARACTER_TITLES[color.id]}${isTaken ? ' (taken)' : ''}`}
            className={`color-swatch${selected ? ' selected' : ''}${isTaken ? ' taken' : ''}`}
            style={{ '--swatch': color.hex } as CSSProperties}
            disabled={isTaken}
            onClick={() => onChange(color.id)}
          />
        );
      })}
    </div>
  );
}
