/**
 * MUI Dark Theme for Modulation Table
 *
 * Matches the existing app dark theme colors from ModulationTable.css
 */

import { createTheme } from '@mui/material/styles';

export const modulationTableTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#4a9eff', // --accent-color
    },
    background: {
      default: '#1a1a1a', // --bg-primary
      paper: '#242424', // --bg-secondary
    },
    text: {
      primary: '#e5e5e5', // --text-primary
      secondary: '#888', // --text-secondary
    },
    divider: '#333', // --border-color
  },
});
