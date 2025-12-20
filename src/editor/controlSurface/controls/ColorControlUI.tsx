/**
 * Color Control Component
 *
 * Visual-first - used for stroke/fill, glow color, palette offsets.
 *
 * UX notes from spec:
 * - Swatch + picker
 * - Palette browsing beats numeric HSL
 * - Sliders for alpha only if needed
 */

import { useCallback, useState, useRef, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import type { ColorControl } from '../types';

interface ColorControlUIProps {
  control: ColorControl;
  onChange: (value: string) => void;
  onReset: () => void;
}

// Predefined color palette for quick selection
const DEFAULT_PALETTE = [
  '#ffffff', '#000000', '#ff0000', '#00ff00', '#0000ff',
  '#ffff00', '#ff00ff', '#00ffff', '#ff8800', '#8800ff',
  '#0088ff', '#88ff00', '#ff0088', '#00ff88', '#8800ff',
];

export const ColorControlUI = observer(function ColorControlUI({ control, onChange, onReset }: ColorControlUIProps) {
  const { value, allowAlpha, label } = control;
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if value is at default
  const isAtDefault = value === control.default;

  // Use custom palette or default
  const colorPalette = DEFAULT_PALETTE;

  // Handle color change from picker
  const handleColorChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // Handle palette swatch click
  const handleSwatchClick = useCallback(
    (color: string) => {
      onChange(color);
    },
    [onChange]
  );

  // Toggle picker visibility
  const togglePicker = useCallback(() => {
    setShowPicker((prev) => !prev);
  }, []);

  // Close picker when clicking outside
  useEffect(() => {
    if (!showPicker) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showPicker]);

  return (
    <div className="control-color">
      <div className="control-header">
        <span className="control-label">{label}</span>
        {!isAtDefault && (
          <button
            className="control-reset-btn"
            onClick={onReset}
            title="Reset to default"
          >
            ↺
          </button>
        )}
      </div>

      <div className="control-body">
        {/* Main swatch button */}
        <button
          className="color-swatch-main"
          style={{ backgroundColor: value }}
          onClick={togglePicker}
          title="Click to open color picker"
        >
          <span className="color-swatch-value">{value}</span>
        </button>

        {/* Color picker popover */}
        {showPicker && (
          <div ref={pickerRef} className="color-picker-popover">
            {/* Native color picker */}
            <div className="color-picker-native">
              <input
                ref={inputRef}
                type="color"
                value={value}
                onChange={handleColorChange}
                className="color-picker-input"
              />
              <span className="color-picker-label">Select color</span>
            </div>

            {/* Palette swatches */}
            <div className="color-palette">
              {colorPalette.map((color) => (
                <button
                  key={color}
                  className={`color-swatch ${value === color ? 'active' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => handleSwatchClick(color)}
                  title={color}
                />
              ))}
            </div>

            {/* Hex input */}
            <div className="color-hex-input">
              <input
                type="text"
                value={value}
                onChange={(e) => {
                  const hex = e.target.value;
                  if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                    onChange(hex);
                  }
                }}
                placeholder="#ffffff"
              />
            </div>

            {/* Alpha slider (if enabled) */}
            {allowAlpha && (
              <div className="color-alpha">
                <label>Alpha</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={1} // TODO: Parse alpha from value
                  onChange={() => {}} // TODO: Apply alpha
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
