import { createApp } from "./app.js";
import { config, isGoogleConfigured } from "./config/env.js";

const app = createApp();

app.listen(config.port, () => {
  console.log(`Backend listening on http://localhost:${config.port}`);
  console.log(`Frontend origins allowed: ${config.frontendOrigins.join(", ")}`);
  console.log(
    isGoogleConfigured()
      ? "Google OAuth: configured"
      : "Google OAuth: NOT configured — set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env",
  );
});
