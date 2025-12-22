/**
 * SVG Renderer
 *
 * Renders a RenderTree to an SVG element using keyed reconciliation.
 *
 * Key invariants:
 * - node.id → DOM element mapping is stable
 * - Effects compose: opacity multiplies, transforms concatenate
 * - Incremental updates - only changed nodes are modified
 * - Groups/effects use <g> wrappers
 */

import type {
  DrawNode,
  RenderTree,
  Style,
  Transform2D,
  Transform3D,
  Geometry,
} from './renderTree';

// =============================================================================
// Types
// =============================================================================

const SVG_NS = 'http://www.w3.org/2000/svg';
const ID_ATTR = 'data-node-id';

interface RenderCtx {
  opacity: number;
  transform: string; // accumulated SVG transform string
}

// =============================================================================
// SVG Renderer
// =============================================================================

export class SvgRenderer {
  private readonly svg: SVGSVGElement;
  private nodeMap = new Map<string, SVGElement>();
  private usedIds = new Set<string>();

  constructor(svg: SVGSVGElement) {
    this.svg = svg;
  }

  /**
   * Render a RenderTree to the SVG.
   */
  render(tree: RenderTree): void {
    this.usedIds.clear();

    const rootCtx: RenderCtx = {
      opacity: 1,
      transform: '',
    };

    // Ensure root group exists
    let root = this.nodeMap.get('__root__') as SVGGElement | undefined;
    if (root === null || root === undefined) {
      root = document.createElementNS(SVG_NS, 'g');
      root.setAttribute(ID_ATTR, '__root__');
      this.svg.appendChild(root);
      this.nodeMap.set('__root__', root);
    }
    this.usedIds.add('__root__');

    // Render the tree
    this.renderNode(root, tree, rootCtx);

    // Clean up orphaned nodes
    this.cleanup();
  }

  /**
   * Clear the renderer state.
   */
  clear(): void {
    const root = this.nodeMap.get('__root__');
    if (root !== null && root !== undefined) {
      root.innerHTML = '';
    }
    this.nodeMap.clear();
    this.usedIds.clear();
  }

  /**
   * Get the SVG element.
   */
  getSvg(): SVGSVGElement {
    return this.svg;
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private renderNode(parent: SVGGElement, node: DrawNode, ctx: RenderCtx): void {
    this.usedIds.add(node.id);

    let el = this.nodeMap.get(node.id);

    // Create element if it doesn't exist
    if (el === null || el === undefined) {
      el = this.createElement(node);
      el.setAttribute(ID_ATTR, node.id);
      this.nodeMap.set(node.id, el);
      parent.appendChild(el);
    } else if (el.parentNode !== parent) {
      // Re-parent if needed
      parent.appendChild(el);
    }

    // Apply node-specific attributes and get next context
    const nextCtx = this.applyNode(el, node, ctx);

    // Render children
    if (node.kind === 'group') {
      this.renderChildren(el as SVGGElement, node.children, nextCtx);
    } else if (node.kind === 'effect') {
      this.renderNode(el as SVGGElement, node.child, nextCtx);
    }
  }

  private renderChildren(
    parent: SVGGElement,
    children: readonly DrawNode[],
    ctx: RenderCtx
  ): void {
    // Track which children we've seen for ordering
    const childIds = children.map((c) => c.id);

    // Remove children that are no longer in the list
    const existingChildren = Array.from(parent.children);
    for (const child of existingChildren) {
      const childId = child.getAttribute(ID_ATTR);
      if (childId !== null && childId !== '' && childId !== '__root__' && !childIds.includes(childId)) {
        // Will be cleaned up in cleanup phase
      }
    }

    // Render each child
    for (const child of children) {
      this.renderNode(parent, child, ctx);
    }

    // Reorder children to match tree order
    for (let i = 0; i < children.length; i++) {
      const expectedId = children[i].id;
      const el = this.nodeMap.get(expectedId);
      if (el !== null && el !== undefined && el.parentNode === parent) {
        const currentIndex = Array.from(parent.children).indexOf(el);
        if (currentIndex !== i) {
          const refNode = parent.children[i];
          if (refNode !== null && refNode !== undefined) {
            parent.insertBefore(el, refNode);
          } else {
            parent.appendChild(el);
          }
        }
      }
    }
  }

  private applyNode(el: SVGElement, node: DrawNode, ctx: RenderCtx): RenderCtx {
    let opacity = ctx.opacity;
    let transform = ctx.transform;

    if (node.kind === 'effect') {
      const effect = node.effect;

      if (effect.kind === 'opacityMul') {
        opacity *= effect.mul;
      }

      if (effect.kind === 'transform2d') {
        transform = combineTransform(transform, transform2dToSvg(effect.transform));
      }

      if (effect.kind === 'transform3d') {
        // For transform3d, we use CSS transform on the element
        const cssTransform = transform3dToCss(effect.transform);
        // SVGElement has style property but TypeScript's lib.dom types are incomplete
        const elStyle = (el as unknown as ElementCSSInlineStyle).style;
        elStyle.transform = cssTransform;
        elStyle.transformStyle = 'preserve-3d';
        if (effect.transform.perspective !== null && effect.transform.perspective !== undefined) {
          elStyle.perspective = `${effect.transform.perspective}px`;
        }
      }

      if (effect.kind === 'filter') {
        // SVGElement has style property but TypeScript's lib.dom types are incomplete
        (el as unknown as ElementCSSInlineStyle).style.filter = effect.filter;
      }

      // Apply accumulated transform and opacity to group wrapper
      if (transform !== '') {
        el.setAttribute('transform', transform);
      }
      el.setAttribute('opacity', String(opacity));
    }

    if (node.kind === 'group') {
      if (transform !== '') {
        el.setAttribute('transform', transform);
      }
      el.setAttribute('opacity', String(opacity));
    }

    if (node.kind === 'shape') {
      // Apply geometry
      applyGeometry(el, node.geom);

      // Apply style
      applyStyle(el, node.style, opacity);

      // Apply transform
      if (transform !== '') {
        el.setAttribute('transform', transform);
      }
    }

    return { opacity, transform };
  }

  private createElement(node: DrawNode): SVGElement {
    if (node.kind === 'group' || node.kind === 'effect') {
      return document.createElementNS(SVG_NS, 'g');
    }

    // Shape node - create based on geometry type
    const geom = node.geom;
    if (geom.kind === 'svgPath') {
      return document.createElementNS(SVG_NS, 'path');
    }
    if (geom.kind === 'circle') {
      return document.createElementNS(SVG_NS, 'circle');
    }
    if (geom.kind === 'rect') {
      return document.createElementNS(SVG_NS, 'rect');
    }

    // Fallback to group
    return document.createElementNS(SVG_NS, 'g');
  }

  private cleanup(): void {
    for (const [id, el] of this.nodeMap) {
      if (!this.usedIds.has(id)) {
        el.remove();
        this.nodeMap.delete(id);
      }
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function applyGeometry(el: SVGElement, geom: Geometry): void {
  if (geom.kind === 'svgPath') {
    el.setAttribute('d', geom.d);
  } else if (geom.kind === 'circle') {
    el.setAttribute('cx', String(geom.cx));
    el.setAttribute('cy', String(geom.cy));
    el.setAttribute('r', String(geom.r));
  } else if (geom.kind === 'rect') {
    el.setAttribute('x', String(geom.x));
    el.setAttribute('y', String(geom.y));
    el.setAttribute('width', String(geom.width));
    el.setAttribute('height', String(geom.height));
    if (geom.rx !== undefined) el.setAttribute('rx', String(geom.rx));
    if (geom.ry !== undefined) el.setAttribute('ry', String(geom.ry));
  }
}

function applyStyle(el: SVGElement, style: Style | undefined, ctxOpacity: number): void {
  // Default style - no stroke unless explicitly set
  const fill = style?.fill ?? 'none';
  const stroke = style?.stroke ?? 'none';
  const strokeWidth = style?.strokeWidth ?? 0;
  const opacity = (style?.opacity ?? 1) * ctxOpacity;

  el.setAttribute('fill', fill);
  el.setAttribute('stroke', stroke);
  el.setAttribute('stroke-width', String(strokeWidth));
  el.setAttribute('opacity', String(opacity));

  if (style?.strokeLinecap !== undefined) {
    el.setAttribute('stroke-linecap', style.strokeLinecap);
  }
  if (style?.strokeLinejoin !== undefined) {
    el.setAttribute('stroke-linejoin', style.strokeLinejoin);
  }
  if (style?.strokeDasharray !== undefined && style?.strokeDasharray !== '') {
    el.setAttribute('stroke-dasharray', style.strokeDasharray);
  }
  if (style?.strokeDashoffset !== undefined) {
    el.setAttribute('stroke-dashoffset', String(style.strokeDashoffset));
  }
  if (style?.filter !== undefined && style?.filter !== '') {
    el.setAttribute('filter', style.filter);
  }
}

/**
 * Convert Transform2D to SVG transform string.
 */
export function transform2dToSvg(t: Transform2D): string {
  const parts: string[] = [];

  // If we have an origin, we need to translate to origin, apply transforms, translate back
  const ox = t.origin?.x ?? 0;
  const oy = t.origin?.y ?? 0;
  const hasOrigin = ox !== 0 || oy !== 0;

  if (hasOrigin) {
    parts.push(`translate(${ox}, ${oy})`);
  }

  if (t.translate !== undefined && t.translate !== null) {
    parts.push(`translate(${t.translate.x}, ${t.translate.y})`);
  }

  if (t.rotate !== undefined) {
    parts.push(`rotate(${t.rotate})`);
  }

  if (t.scale !== undefined) {
    if (typeof t.scale === 'number') {
      parts.push(`scale(${t.scale})`);
    } else {
      parts.push(`scale(${t.scale.x}, ${t.scale.y})`);
    }
  }

  if (hasOrigin) {
    parts.push(`translate(${-ox}, ${-oy})`);
  }

  return parts.join(' ');
}

/**
 * Convert Transform3D to CSS transform string.
 */
export function transform3dToCss(t: Transform3D): string {
  const parts: string[] = [];

  if (t.translate !== undefined && t.translate !== null) {
    parts.push(`translate3d(${t.translate.x}px, ${t.translate.y}px, ${t.translate.z}px)`);
  }

  if (t.rotate !== undefined && t.rotate !== null) {
    if (t.rotate.x !== 0) parts.push(`rotateX(${t.rotate.x}deg)`);
    if (t.rotate.y !== 0) parts.push(`rotateY(${t.rotate.y}deg)`);
    if (t.rotate.z !== 0) parts.push(`rotateZ(${t.rotate.z}deg)`);
  }

  if (t.scale !== undefined) {
    if (typeof t.scale === 'number') {
      parts.push(`scale3d(${t.scale}, ${t.scale}, ${t.scale})`);
    } else {
      parts.push(`scale3d(${t.scale.x}, ${t.scale.y}, ${t.scale.z})`);
    }
  }

  return parts.join(' ');
}

/**
 * Combine two transform strings.
 */
function combineTransform(a: string, b: string): string {
  if (a === '') return b;
  if (b === '') return a;
  return `${a} ${b}`;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create an SvgRenderer for an existing SVG element.
 */
export function createSvgRenderer(svg: SVGSVGElement): SvgRenderer {
  return new SvgRenderer(svg);
}

/**
 * Create an SvgRenderer with a new SVG element.
 */
export function createSvgRendererWithElement(
  width: number,
  height: number,
  viewBox?: string
): { renderer: SvgRenderer; svg: SVGSVGElement } {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', viewBox ?? `0 0 ${width} ${height}`);
  svg.style.background = 'transparent';

  return {
    renderer: new SvgRenderer(svg),
    svg,
  };
}
