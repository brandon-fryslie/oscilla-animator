import { useState, useMemo } from 'react';
import { observer } from 'mobx-react-lite';
import { useDraggable } from '@dnd-kit/core';
import { useStore } from './stores';
import { ALL_SUBCATEGORIES } from './types';
import type { BlockSubcategory, BlockForm } from './types';
import type { BlockDefinition } from './blocks/types';
import { getBlockDefinitions, getBlocksForPalette, getBlockTags, getBlockForm } from './blocks';
import './BlockLibrary.css';

// import { listCompositeDefinitions } from './composites'; // TODO: Refactor composites
const listCompositeDefinitions = () => [];

const FORM_ORDER: BlockForm[] = ['macro', 'composite', 'primitive'];

const FORM_LABELS: Record<BlockForm, string> = {
  macro: 'Macros',
  composite: 'Composites',
  primitive: 'Primitives',
};

const SUBCATEGORY_ORDER = new Map<BlockSubcategory, number>(
  ALL_SUBCATEGORIES.map((subcategory: BlockSubcategory, index: number) => [subcategory, index])
);


interface FormGroup {
  form: BlockForm;
  label: string;
  count: number;
  subcategories: Array<{
    subcategory: BlockSubcategory;
    blocks: readonly BlockDefinition[];
  }>;
}

function getSubcategoryKey(form: BlockForm, subcategory: BlockSubcategory): string {
  return `${form}:${subcategory}`;
}

function sortBlocksForDisplay(a: BlockDefinition, b: BlockDefinition): number {
  const priorityDiff = (a.priority ?? 99) - (b.priority ?? 99);
  if (priorityDiff !== 0) return priorityDiff;
  return a.label.localeCompare(b.label);
}

function groupBlocksByForm(blocks: readonly BlockDefinition[]): FormGroup[] {
  const formMap = new Map<BlockForm, Map<BlockSubcategory, BlockDefinition[]>>();

  for (const block of blocks) {
    const form = getBlockForm(block);
    let subcategoryMap = formMap.get(form);
    if (!subcategoryMap) {
      subcategoryMap = new Map<BlockSubcategory, BlockDefinition[]>();
      formMap.set(form, subcategoryMap);
    }

    const subcategory = block.subcategory ?? 'Other';
    const list = subcategoryMap.get(subcategory) ?? [];
    list.push(block);
    subcategoryMap.set(subcategory, list);
  }

  return FORM_ORDER.map((form) => {
    const subcategoryMap = formMap.get(form);
    if (!subcategoryMap) return null;

    const subcategories = Array.from(subcategoryMap.entries())
      .sort(
        (a, b) => (SUBCATEGORY_ORDER.get(a[0]) ?? Number.MAX_SAFE_INTEGER) - (SUBCATEGORY_ORDER.get(b[0]) ?? Number.MAX_SAFE_INTEGER)
      )
      .map(([subcategory, list]) => ({
        subcategory,
        blocks: list.slice().sort(sortBlocksForDisplay),
      }));

    const count = subcategories.reduce((acc, sub) => acc + sub.blocks.length, 0);

    return {
      form,
      label: FORM_LABELS[form],
      count,
      subcategories,
    };
  }).filter(Boolean) as FormGroup[];
}

interface DraggableBlockItemProps {
  definition: BlockDefinition;
  isSelected: boolean;
  onSelect: () => void;
  onDoubleClickAdd: () => void;
}

/**
 * Individual draggable block item in the library.
 * Compact design with description in tooltip.
 * Left side (drag handle) = drag to place OR double-click to add, right side (name) = click to preview.
 */
function DraggableBlockItem({ definition, isSelected, onSelect, onDoubleClickAdd }: DraggableBlockItemProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `library-${definition.type}`,
    data: {
      type: 'library-block',
      blockType: definition.type,
      definition,
    },
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDoubleClickAdd();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`block-item ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
      data-block-type={definition.type}
      title={definition.description}
    >
      {/* Drag handle - left portion */}
      <div
        className="block-drag-handle"
        style={{ backgroundColor: definition.color }}
        {...listeners}
        {...attributes}
      >
        <span className="drag-grip">⋮⋮</span>
      </div>
      {/* Click area - right portion (double-click to add) */}
      <span
        className="block-name"
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onDoubleClick={handleDoubleClick}
      >
        {definition.label}
      </span>
    </div>
  );
}


/**
 * BlockLibrary displays available blocks by category with search.
 * Supports lane-based filtering when an active lane is set.
 */
export const BlockLibrary = observer(() => {
  const store = useStore();
  const [search, setSearch] = useState('');
  const [collapsedForms, setCollapsedForms] = useState<Set<BlockForm>>(new Set());
  const [collapsedSubcategories, setCollapsedSubcategories] = useState<Set<string>>(new Set());
  const [showAllBlocks, setShowAllBlocks] = useState(false);

  const previewedType = store.uiStore.previewedDefinition?.type ?? null;
  const activeLane = store.activeLane;
  const filterByLane = store.uiStore.settings.filterByLane;

  const blockDefs = useMemo(() => getBlockDefinitions(), []);

  const formGroups = useMemo(
    () => groupBlocksByForm(blockDefs),
    [blockDefs]
  );

  /**
   * Add a block to its suggested lane (first lane matching laneKind).
   */
  const addBlockToSuggestedLane = (definition: BlockDefinition) => {
    const targetLane = store.patchStore.lanes.find((lane) => lane.kind === definition.laneKind);
    if (targetLane) {
      store.patchStore.addBlock(definition.type, targetLane.id, definition.defaultParams);
    }
  };

  // Get filtered blocks based on lane context
  const { matched: matchedBlocks, other: otherBlocks } = useMemo(() => {
    return getBlocksForPalette(
      filterByLane,
      activeLane?.kind,
      activeLane?.flavor
    );
  }, [filterByLane, activeLane?.kind, activeLane?.flavor]);

  // Filter by search term
  const searchFilteredBlocks = useMemo(() => {
    if (!search.trim()) return null;
    const term = search.toLowerCase();
    return blockDefs.filter((b) => {
      const labelsMatch =
        b.label.toLowerCase().includes(term) ||
        b.description.toLowerCase().includes(term) ||
        b.type.toLowerCase().includes(term);

      const tags = getBlockTags(b);
      const tagsMatch = Object.entries(tags).some(([key, value]) => {
        if (typeof value === 'string') {
          return (
            key.toLowerCase().includes(term) ||
            value.toLowerCase().includes(term)
          );
        }
        if (typeof value === 'number' || typeof value === 'boolean') {
          return (
            key.toLowerCase().includes(term) ||
            String(value).toLowerCase().includes(term)
          );
        }
        if (Array.isArray(value)) {
          return (
            key.toLowerCase().includes(term) ||
            value.some((item) =>
              String(item).toLowerCase().includes(term)
            )
          );
        }
        return key.toLowerCase().includes(term);
      });

      return labelsMatch || tagsMatch;
    });
  }, [search, blockDefs]);

  const toggleForm = (form: BlockForm) => {
    setCollapsedForms((prev) => {
      const next = new Set(prev);
      if (next.has(form)) {
        next.delete(form);
      } else {
        next.add(form);
      }
      return next;
    });
  };

  const toggleSubcategory = (key: string) => {
    setCollapsedSubcategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Determine if we're in filtered mode (active lane + filter enabled)
  const isFiltered = filterByLane && activeLane !== null;

  const compositeCount = listCompositeDefinitions().length;

  return (
    <div className="block-library">
      <div className="library-header">
        <h2>Blocks <span className="library-total-count">({blockDefs.length})</span></h2>
        {compositeCount > 0 && (
          <div className="library-composite-badge" title="User composites available">
            {compositeCount} composites
          </div>
        )}
        {isFiltered && (
          <div className="library-filter-badge" title={`Showing blocks for ${activeLane.label}`}>
            {activeLane.kind}
          </div>
        )}
        <input
          type="text"
          className="library-search"
          placeholder="Search blocks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="library-categories">
        {searchFilteredBlocks ? (
          // Search results (flat list)
          <div className="search-results">
            {searchFilteredBlocks.length === 0 ? (
              <div className="category-empty">No matches</div>
            ) : (
              searchFilteredBlocks.map((definition) => (
                <DraggableBlockItem
                  key={definition.type}
                  definition={definition}
                  isSelected={previewedType === definition.type}
                  onSelect={() => store.uiStore.previewDefinition(definition)}
                  onDoubleClickAdd={() => addBlockToSuggestedLane(definition)}
                />
              ))
            )}
          </div>
        ) : isFiltered ? (
          // Lane-filtered view
          <>
            {/* Matched blocks section */}
            <div className="filtered-section matched">
              <div className="filtered-section-header">
                <span className="filtered-section-label">For {activeLane.label}</span>
                <span className="filtered-section-count">{matchedBlocks.length}</span>
              </div>
              <div className="filtered-blocks">
                {matchedBlocks.length === 0 ? (
                  <div className="category-empty">No blocks for this lane type</div>
                ) : (
                  matchedBlocks.map((definition) => (
                    <DraggableBlockItem
                      key={definition.type}
                      definition={definition}
                      isSelected={previewedType === definition.type}
                      onSelect={() => store.uiStore.previewDefinition(definition)}
                      onDoubleClickAdd={() => addBlockToSuggestedLane(definition)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Other blocks section (collapsible) */}
            {otherBlocks.length > 0 && (
              <div className={`filtered-section other ${showAllBlocks ? 'expanded' : ''}`}>
                <div
                  className="filtered-section-header clickable"
                  onClick={() => setShowAllBlocks(!showAllBlocks)}
                >
                  <span className="filtered-section-chevron">
                    {showAllBlocks ? '▾' : '▸'}
                  </span>
                  <span className="filtered-section-label">All other blocks</span>
                  <span className="filtered-section-count">{otherBlocks.length}</span>
                </div>
                {showAllBlocks && (
                  <div className="filtered-blocks">
                    {otherBlocks.map((definition) => (
                      <DraggableBlockItem
                        key={definition.type}
                        definition={definition}
                        isSelected={previewedType === definition.type}
                        onSelect={() => store.uiStore.previewDefinition(definition)}
                        onDoubleClickAdd={() => addBlockToSuggestedLane(definition)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          // Form/Subcategory view (default, no filtering)
          formGroups.map((group) => {
            const isFormCollapsed = collapsedForms.has(group.form);

            return (
              <div key={group.form} className={`tier ${isFormCollapsed ? 'collapsed' : ''}`}>
                <div
                  className="tier-header"
                  onClick={() => toggleForm(group.form)}
                >
                  <span className="category-chevron">{isFormCollapsed ? '▸' : '▾'}</span>
                  <span className="tier-label">{group.label}</span>
                  <span className="category-count">{group.count}</span>
                </div>

                {!isFormCollapsed && (
                  <div className="tier-subcategories">
                    {group.subcategories.map(({ subcategory, blocks }) => {
                      const key = getSubcategoryKey(group.form, subcategory);
                      const isCollapsed = collapsedSubcategories.has(key);

                      return (
                        <div key={key} className={`subcategory ${isCollapsed ? 'collapsed' : ''}`}>
                          <div
                            className="subcategory-header"
                            onClick={() => toggleSubcategory(key)}
                          >
                            <span className="category-chevron">{isCollapsed ? '▸' : '▾'}</span>
                            <span className="subcategory-label">{subcategory}</span>
                            <span className="category-count">{blocks.length}</span>
                          </div>

                          {!isCollapsed && (
                            <div className="category-blocks">
                              {blocks.map((definition) => (
                                <DraggableBlockItem
                                  key={definition.type}
                                  definition={definition}
                                  isSelected={previewedType === definition.type}
                                  onSelect={() => store.uiStore.previewDefinition(definition)}
                                  onDoubleClickAdd={() => addBlockToSuggestedLane(definition)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});
