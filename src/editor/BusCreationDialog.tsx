/**
 * Bus Creation Dialog Component
 *
 * TODO: Migrate to Edge-based architecture
 * This component relies on the deleted busStore.
 */

import { observer } from 'mobx-react-lite';
import type React from 'react';

interface BusCreationDialogProps {
  isOpen?: boolean;
  onClose: () => void;
  onCreated?: (busId: string) => void;
  initialName?: string;
}

export const BusCreationDialog = observer((_props: BusCreationDialogProps): React.ReactElement | null => {
  // Stub - temporarily disabled
  return null;
});
