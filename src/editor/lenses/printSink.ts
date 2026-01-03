/**
 * Print Sink
 *
 * Global sink for print lens output.
 * This allows the print lens (which runs during runtime evaluation)
 * to push logs to the DebugUIStore without direct store access.
 */

type PrintCallback = (label: string, value: unknown) => void;

let printCallback: PrintCallback | null = null;

/**
 * Register the print callback (called by store initialization).
 */
export function registerPrintCallback(callback: PrintCallback): void {
  printCallback = callback;
}

/**
 * Unregister the print callback (called on store cleanup).
 */
export function unregisterPrintCallback(): void {
  printCallback = null;
}

/**
 * Push a print log entry (called by the print lens).
 * Falls back to console.log if no callback is registered.
 */
export function pushPrintLog(label: string, value: unknown): void {
  if (printCallback) {
    printCallback(label, value);
  } else {
    // Fallback to console if store not initialized
    console.log(`[Lens:${label}]`, value);
  }
}
