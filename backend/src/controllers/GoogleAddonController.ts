import type { Request, Response } from "express";

/**
 * Google Workspace Add-on HTTP endpoint.
 *
 * Google POSTs here when the add-on opens. We return Card Service JSON — not an
 * HTML page. Manifest runFunction must point at this HTTPS backend route.
 */
export function googleAddonHandler(req: Request, res: Response): void {
  console.log("========== GOOGLE ADD-ON REQUEST ==========");
  console.log("BODY:");
  console.log(JSON.stringify(req.body, null, 2));

  console.log("HEADERS:");
  console.log(JSON.stringify(req.headers, null, 2));

  res.status(200).json({
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
                        text: "Google Workspace Add-on is working!",
                      },
                    },
                    {
                      textParagraph: {
                        text: "Google successfully reached the Render backend.",
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
