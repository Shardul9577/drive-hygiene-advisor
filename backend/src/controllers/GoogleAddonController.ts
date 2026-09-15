import type { Request, Response } from "express";
import { config } from "../config/env.js";
import { AddonHandoff } from "../services/auth/addonHandoff.js";
import { resolveGoogleUser } from "../services/auth/googleUserInfo.js";

interface AddonAuthEvent {
  userOAuthToken?: string;
  authorizedScopes?: string[];
}

function redactAddonBody(body: unknown): unknown {
  if (!body || typeof body !== "object") return body;
  const clone = structuredClone(body) as Record<string, unknown>;
  const auth = clone.authorizationEventObject as Record<string, unknown> | undefined;
  if (auth) {
    if (typeof auth.userOAuthToken === "string") auth.userOAuthToken = "[redacted]";
    if (typeof auth.systemIdToken === "string") auth.systemIdToken = "[redacted]";
  }
  return clone;
}

function pushCard(widgets: unknown[]) {
  return {
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
                  widgets,
                },
              ],
            },
          },
        ],
      },
    },
  };
}

function openAppButton(url: string, text: string) {
  return {
    buttonList: {
      buttons: [
        {
          text,
          onClick: {
            openLink: {
              url,
              openAs: "FULL_SIZE",
              onClose: "NOTHING",
            },
          },
        },
      ],
    },
  };
}

/**
 * Google Workspace Add-on HTTP endpoint (homepage / items-selected trigger).
 * Mints a one-time handoff ticket from userOAuthToken so "Open app" lands
 * already signed in on the Vercel frontend (via /api rewrite → session cookie).
 */
export async function googleAddonHandler(req: Request, res: Response): Promise<void> {
  console.log("Google Add-on request:");
  console.log(JSON.stringify(redactAddonBody(req.body), null, 2));

  const auth = (req.body as { authorizationEventObject?: AddonAuthEvent })
    ?.authorizationEventObject;
  const accessToken = auth?.userOAuthToken;
  const scopes = auth?.authorizedScopes ?? [];
  const hasDriveScope =
    scopes.includes(config.driveScope) ||
    scopes.includes("https://www.googleapis.com/auth/drive.readonly") ||
    scopes.includes("https://www.googleapis.com/auth/drive");

  const loginUrl = `${config.frontendUrl}/login`;

  if (!accessToken) {
    res.status(200).json(
      pushCard([
        {
          textParagraph: {
            text: "Sign in to open Drive Hygiene Advisor.",
          },
        },
        openAppButton(loginUrl, "Open Drive Hygiene Advisor"),
      ]),
    );
    return;
  }

  try {
    const identity = await resolveGoogleUser(accessToken);
    const ticket = AddonHandoff.create({
      accessToken,
      googleId: identity.googleId,
      email: identity.email,
      name: identity.name,
      picture: identity.picture,
    });

    // Must stay under openLinkUrlPrefixes (Vercel). Session cookie is set when
    // the browser hits this path and Vercel rewrites /api → Render.
    const handoffUrl = `${config.frontendUrl}/api/auth/addon-handoff?ticket=${encodeURIComponent(ticket)}`;

    const scopeNote = hasDriveScope
      ? "You are signed in. Open the app to scan your Drive."
      : "Open the app to continue. If scanning fails, re-authorize the add-on after updating scopes to include drive.metadata.readonly.";

    res.status(200).json(
      pushCard([
        {
          textParagraph: {
            text: `Hi ${identity.name.split(" ")[0] || "there"} — ${scopeNote}`,
          },
        },
        openAppButton(handoffUrl, "Open Drive Hygiene Advisor"),
      ]),
    );
  } catch (err) {
    console.error("[addon] handoff mint failed:", err instanceof Error ? err.message : err);
    res.status(200).json(
      pushCard([
        {
          textParagraph: {
            text: "Could not use the add-on token. Open the app and sign in with Google.",
          },
        },
        openAppButton(loginUrl, "Open Drive Hygiene Advisor"),
      ]),
    );
  }
}
