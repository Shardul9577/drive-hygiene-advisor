import type { Request, Response } from "express";
import { config } from "../config/env.js";

/**
 * Prefer the deployed HTTPS frontend for add-on openLink buttons.
 * Falls back to the default FRONTEND_URL entry when only localhost is configured.
 */
function addonDashboardUrl(): string {
  const httpsOrigin = config.frontendOrigins.find((origin) =>
    origin.startsWith("https://"),
  );
  return httpsOrigin ?? config.frontendUrl;
}

/**
 * Google Workspace Add-on HTTP endpoint.
 *
 * Google POSTs here when the add-on opens. We return Card Service JSON — not an
 * HTML page. Vercel cannot be used as the runFunction URL; this backend route is.
 *
 * First version: intro card + button that opens the existing web dashboard.
 */
export function googleAddonHandler(_req: Request, res: Response): void {
  const dashboardUrl = addonDashboardUrl();

  res.json({
    renderActions: {
      action: {
        navigations: [
          {
            pushCard: {
              header: {
                title: "Drive Hygiene Advisor",
                subtitle: "Duplicates · storage · sharing risk",
              },
              sections: [
                {
                  widgets: [
                    {
                      textParagraph: {
                        text:
                          "Scan your Google Drive for duplicate candidates, storage-heavy files, and broadly shared items — without changing anything in Drive.",
                      },
                    },
                    {
                      textParagraph: {
                        text:
                          "Analysis only. Scope used by the web app: <b>drive.metadata.readonly</b>.",
                      },
                    },
                    {
                      buttonList: {
                        buttons: [
                          {
                            text: "Open dashboard",
                            onClick: {
                              openLink: {
                                url: dashboardUrl,
                              },
                            },
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
      },
    },
  });
}
