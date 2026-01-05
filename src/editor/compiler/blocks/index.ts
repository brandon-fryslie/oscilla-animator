/**
 * IR Block Registration
 *
 * Imports all IR-lowered block modules so they self-register with the IR block registry.
 */

import './domain';
import './signal';
import './rhythm';
import './debug';
import './scene/Camera';
import './defaultSources';

export function registerCompilerBlocks(): void {
  // Side-effect imports above register block types.
}
