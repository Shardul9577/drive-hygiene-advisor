export interface GoogleUserInfo {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
}

/**
 * Resolve identity from an add-on (or other) Google access token.
 * Prefers userinfo; falls back to tokeninfo when profile scopes are missing.
 */
export async function resolveGoogleUser(accessToken: string): Promise<GoogleUserInfo> {
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (userInfoRes.ok) {
    const data = (await userInfoRes.json()) as {
      sub?: string;
      email?: string;
      name?: string;
      picture?: string;
    };
    if (data.sub && data.email) {
      return {
        googleId: data.sub,
        email: data.email,
        name: data.name || data.email,
        picture: data.picture,
      };
    }
  }

  const tokenInfoRes = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
  );
  if (!tokenInfoRes.ok) {
    throw new Error(`Could not resolve Google user (${userInfoRes.status}/${tokenInfoRes.status})`);
  }

  const token = (await tokenInfoRes.json()) as {
    sub?: string;
    email?: string;
  };
  if (!token.sub || !token.email) {
    throw new Error("Google token did not include email/sub — add openid/email scopes to the add-on.");
  }

  return {
    googleId: token.sub,
    email: token.email,
    name: token.email,
  };
}
