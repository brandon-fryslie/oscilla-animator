import type { BlockDefinition } from './blocks';

/**
 * Drag overlay that shows the block being dragged.
 */
export function DragOverlayContent({
  definition,
  placedBlockLabel,
  placedBlockColor,
}: {
  definition: BlockDefinition | null;
  placedBlockLabel: string | null;
  placedBlockColor: string | null;
}) {
  const label = definition?.label ?? placedBlockLabel;
  const color = definition?.color ?? placedBlockColor ?? '#666';

  if (!label) return null;

  return (
    <div
      className="drag-overlay-block"
      style={{
        backgroundColor: color,
        padding: '8px 12px',
        borderRadius: '6px',
        color: '#fff',
        fontWeight: 500,
        fontSize: '13px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </div>
  );
}
