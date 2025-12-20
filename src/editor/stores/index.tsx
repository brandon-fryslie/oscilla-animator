/**
 * @file MobX Stores Index
 * @description Creates and exports the root store and a React context provider.
 */

import React from 'react';
import { RootStore } from './RootStore';

// Export the RootStore type for external imports
export type { RootStore } from './RootStore';

const store = new RootStore();

const StoreContext = React.createContext<RootStore>(store);

export const StoreProvider = ({ children }: { children: React.ReactNode }) => {
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
};

export const useStore = () => {
  return React.useContext(StoreContext);
};

// For convenience, also export the store instance directly
export { store };
