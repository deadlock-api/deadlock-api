export const INGEST_REPO = "https://github.com/deadlock-api/deadlock-api-ingest";

/** The per-user Windows installer of the latest release. */
export const WINDOWS_SETUP_URL = `${INGEST_REPO}/releases/latest/download/deadlock-api-ingest-setup.exe`;

/** The ingest page's install steps, for calls to action on other pages. */
export const INGEST_INSTALL_PATH = "/ingest-cache#install";

/** How recent an upload must be for the tool to unlock that account's player tracker; mirrors the API. */
export const INGEST_TRACKER_WINDOW_DAYS = 14;
