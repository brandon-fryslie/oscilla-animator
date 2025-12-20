import { useDroppable } from '@dnd-kit/core';

/**
 * Trash zone that appears when dragging placed blocks.
 */
export function TrashZone({ isVisible }: { isVisible: boolean }) {
  const { isOver, setNodeRef } = useDroppable({
    id: 'trash-zone',
    data: { type: 'trash' },
  });

  if (!isVisible) return null;

  return (
    <div
      ref={setNodeRef}
      className={`trash-zone ${isOver ? 'trash-zone-active' : ''}`}
    >
      <span className="trash-icon">🗑️</span>
      <span className="trash-label">{isOver ? 'Release to delete' : 'Drop to delete'}</span>
    </div>
  );
}
