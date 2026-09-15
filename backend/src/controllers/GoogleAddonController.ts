import type { Request, Response } from "express";
import { config } from "../config/env.js";

/**
 * Google Workspace Add-on HTTP endpoint (homepage / items-selected trigger).
 * Google POSTs a JSON event here; we return Card Service JSON.
 */
export function googleAddonHandler(req: Request, res: Response): void {
  console.log("Google Add-on request:");
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
                        text: "Your Google Add-on is working!",
                      },
                    },
                    {
                      buttonList: {
                        buttons: [
                          {
                            text: "Open Drive Hygiene Advisor",
                            onClick: {
                              openLink: {
                                url: config.frontendUrl,
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
