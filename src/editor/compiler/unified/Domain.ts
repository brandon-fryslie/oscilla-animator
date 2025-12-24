/**
 * @file Domain - Element identity and domain definitions
 * @description Defines Domain for per-element Field evaluation.
 *
 * Architecture:
 * - Domain provides stable element IDs for Field<T> evaluation
 * - Element IDs must be stable across frames (same element = same ID)
 * - Domains define the iteration space for Field expressions
 * - Domain equality enables compile-time mismatch detection
 *
 * Key Principle: Fields are parameterized by Domain, not by array size.
 * This enables per-element phase offsets, noise seeds, etc.
 */

/**
 * Element identifier - must be stable across frames.
 */
export type ElementId = string;

/**
 * Optional topology information for neighbor queries.
 */
export interface Topology {
  /** Get neighbors of an element */
  readonly neighbors: (elementId: ElementId) => readonly ElementId[];

  /** Check if two elements are neighbors */
  readonly areNeighbors: (a: ElementId, b: ElementId) => boolean;
}

/**
 * Domain defines the iteration space for Field<T> evaluation.
 *
 * Domains provide:
 * - Stable element IDs (same element always has same ID across frames)
 * - Ordered element list (consistent iteration order)
 * - Optional topology (for spatial queries)
 */
export interface Domain {
  /** Unique domain identifier */
  readonly id: string;

  /** Ordered list of stable element IDs */
  readonly elements: readonly ElementId[];

  /** Optional topology for neighbor queries */
  readonly topology?: Topology;
}

/**
 * Check if two domains are compatible (same elements).
 *
 * @param a - First domain
 * @param b - Second domain
 * @returns True if domains have identical element lists
 */
export function domainsAreCompatible(a: Domain, b: Domain): boolean {
  if (a.elements.length !== b.elements.length) {
    return false;
  }

  // Check element-by-element equality
  for (let i = 0; i < a.elements.length; i++) {
    if (a.elements[i] !== b.elements[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Create a simple domain from element count.
 *
 * @param id - Domain ID
 * @param count - Number of elements
 * @returns Domain with elements ["0", "1", "2", ...]
 */
export function createSimpleDomain(id: string, count: number): Domain {
  const elements: ElementId[] = [];
  for (let i = 0; i < count; i++) {
    elements.push(String(i));
  }

  return {
    id,
    elements,
  };
}

/**
 * Create domain from explicit element IDs.
 *
 * @param id - Domain ID
 * @param elementIds - Explicit element IDs
 * @returns Domain with provided elements
 */
export function createDomain(id: string, elementIds: ElementId[]): Domain {
  return {
    id,
    elements: [...elementIds],
  };
}

/**
 * Domain mismatch error - thrown at compile time when domains don't match.
 */
export class DomainMismatchError extends Error {
  public readonly expectedDomain: string;
  public readonly actualDomain: string;
  public readonly context: string;

  constructor(expectedDomain: string, actualDomain: string, context: string) {
    super(
      `Domain mismatch in ${context}: expected domain "${expectedDomain}", got "${actualDomain}"`
    );
    this.name = 'DomainMismatchError';
    this.expectedDomain = expectedDomain;
    this.actualDomain = actualDomain;
    this.context = context;
  }
}

/**
 * Validate that two domains are compatible, throw if not.
 *
 * @param a - First domain
 * @param b - Second domain
 * @param context - Context for error message
 * @throws DomainMismatchError if domains are incompatible
 */
export function validateDomainCompatibility(
  a: Domain,
  b: Domain,
  context: string
): void {
  if (!domainsAreCompatible(a, b)) {
    throw new DomainMismatchError(a.id, b.id, context);
  }
}
