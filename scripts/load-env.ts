// Scripts run under tsx, not Vite, so .env isn't loaded for them. Load it the
// same way the app does (vite.config.ts), so KNOCK_SECRET_API_KEY reaches
// notifierFromEnv. A missing .env is fine: the Notification port then only logs.
export function loadDotEnv(file = ".env") {
  try {
    process.loadEnvFile(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}
