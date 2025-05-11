/**
 * By default, Remix will handle hydrating your app on the client for you.
 * You are free to delete this file if you'd like to, but if you ever want it revealed again, you can run `npx remix reveal` ✨
 * For more information, see https://remix.run/file-conventions/entry.client
 */

import { StrictMode, startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";
import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import { LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";

const darkTheme = createTheme({
  palette: {
    mode: "dark",
  },
});

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <ThemeProvider theme={darkTheme}>
        <CssBaseline />
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <HydratedRouter />
        </LocalizationProvider>
      </ThemeProvider>
    </StrictMode>,
  );
});
