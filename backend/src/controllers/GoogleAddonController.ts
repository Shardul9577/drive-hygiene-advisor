import type { Request, Response } from "express";

/**
 * Google Workspace Add-on HTTP endpoint (homepage / items-selected trigger).
 * Google POSTs a JSON event here; we return Card Service JSON.
 */
export function googleAddonHandler(req: Request, res: Response): void {
  console.log("========== GOOGLE ADD-ON ==========");
  console.log(JSON.stringify(req.body, null, 2));

  res.status(200).json({
    renderActions: {
      action: {
        navigations: [
          {
            pushCard: {
              header: {
                title: "Drive Hygiene Advisor",
              },
              sections: [
                {
                  widgets: [
                    {
                      textParagraph: {
                        text: "Add-on is working!",
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
