/**
 * Core types for default source attachments.
 *
 * Default sources can be backed by "provider blocks" - hidden blocks that
 * generate values for undriven inputs. This file defines the type system
 * for attaching providers to inputs.
 */

/**
 * Identifies which block input is receiving the default source.
 */
export type DefaultSourceTarget = Readonly<{
  blockId: string;
  slotId: string;
}>;

/**
 * Identifies which provider block is supplying the default source.
 *
 * The provider is a hidden block that:
 * - Reads from buses and/or has editable constant inputs
 * - Produces an output that feeds the target input
 */
export type DefaultSourceProvider = Readonly<{
  /** Unique ID for this provider instance (deterministic: dsprov:${blockId}:${slotId}) */
  providerId: string;

  /** Block type from allowlist (e.g., 'DSConstSignalFloat', 'Oscillator') */
  blockType: string;

  /** Which output port of the provider feeds the target */
  outputPortId: string;

  /** Maps provider input IDs to their DefaultSource IDs for editable values */
  editableInputSourceIds: Readonly<Record<string, string>>;
}>;

/**
 * Complete attachment: links a target input to a provider block.
 *
 * At compile time, this attachment is converted into:
 * - A hidden provider block instance
 * - A wire from provider output to target input
 * - Bus listeners for provider inputs (if required)
 */
export type DefaultSourceAttachment = Readonly<{
  target: DefaultSourceTarget;
  provider: DefaultSourceProvider;
}>;
