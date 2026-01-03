/**
 * LayoutSelector Component
 *
 * Dropdown to switch between lane layouts.
 */

import { observer } from 'mobx-react-lite';
import { useStore } from './stores';
import type { LaneLayout } from './types'; // Assuming LaneLayout is in types
import './LayoutSelector.css';

export const LayoutSelector = observer(() => {
  const store = useStore();
  const currentLayout = store.viewStore.currentLayout;
  const layouts = store.viewStore.availableLayouts;

  return (
    <div className="layout-selector">
      <label className="layout-label">Layout:</label>
      <select
        className="layout-select"
        value={currentLayout.id}
        onChange={(e) => store.viewStore.switchLayout(e.target.value)}
      >
        {layouts.map((layout: LaneLayout) => (
          <option key={layout.id} value={layout.id}>
            {layout.name}
          </option>
        ))}
      </select>
      <span className="layout-hint" title={currentLayout.description}>
        ?
      </span>
    </div>
  );
});
