import type { DriveFile, RiskAssessment, RiskLevel } from "../../types/hygiene";

/**
 * Exposure scoring.
 *
 * This score describes HOW WIDELY A FILE IS SHARED, not whether the file is
 * unsafe. A public link on a marketing brochure is entirely correct; the same
 * link on a payroll sheet probably is not. The product cannot tell those apart,
 * so it reports the access configuration and the signals behind it, and leaves
 * the judgement to the person who knows what the file contains. Every UI label
 * is worded accordingly ("Anyone with the link can open this", never "unsafe").
 *
 * Weights, and why:
 *   +50  link sharing      — the only signal that exposes a file beyond people
 *                            the owner explicitly chose. Alone it reaches HIGH.
 *   +10  public discovery  — indexable, so exposure no longer needs the link.
 *   +25  external accounts — outside the owner's domain; deliberate but notable.
 *   +15  external editors  — write access is harder to walk back than read.
 *   +15  Google Group      — real access grants; ignoring them falsely looks private.
 *   +10  whole-domain      — broad, but bounded by the organisation.
 *   +5   many collaborators— mild sprawl signal.
 *   +10  sensitive name    — a filename hint, never used on its own.
 *
 * Bands: 0–20 LOW · 21–49 MEDIUM · 50+ HIGH
 */

/**
 * Filename hints only. The app reads no file content, so this is a weak signal
 * by construction and is weighted so it can never by itself reach HIGH — it
 * only escalates a file that is already broadly shared.
 */
const SENSITIVE_NAME =
  /\b(salary|payroll|passport|ssn|tax|financial|confidential|secret|credential|password|bank|invoice|hr[-\s]|pii|private)\b/i;

export function scoreFile(file: DriveFile, ownerEmail?: string): RiskAssessment {
  const permissions = file.permissions ?? [];
  const reasons: string[] = [];
  let score = 0;

  const owner =
    ownerEmail ??
    file.owners?.[0]?.emailAddress ??
    permissions.find((p) => p.role === "owner")?.emailAddress;

  // Drive omits the permissions array entirely when the caller cannot read the
  // ACL. That is unknown exposure, not zero exposure, and saying so is more
  // honest than showing a reassuring green LOW badge.
  if (permissions.length === 0) {
    return {
      file,
      score: 0,
      level: "LOW",
      sharingKnown: false,
      reasons: [
        "Sharing details were not available for this file, so its exposure could not be assessed.",
      ],
    };
  }

  const linkShares = permissions.filter((p) => p.type === "anyone");
  if (linkShares.length > 0) {
    score += 50;
    const canEdit = linkShares.some(
      (p) => p.role === "writer" || p.role === "fileOrganizer",
    );
    reasons.push(
      canEdit
        ? "Anyone with the link can edit this file"
        : "Anyone with the link can open this file",
    );

    if (linkShares.some((p) => p.allowFileDiscovery)) {
      score += 10;
      reasons.push("The file can be found in search, so the link is not needed to reach it");
    }
  }

  const domainShares = permissions.filter((p) => p.type === "domain");
  if (domainShares.length > 0) {
    score += 10;
    const domains = domainShares.map((d) => d.domain ?? "an organisation").join(", ");
    reasons.push(`Shared with everyone at ${domains}`);
  }

  const externalUsers = permissions.filter((p) => {
    if (p.type !== "user" || !p.emailAddress || p.role === "owner") return false;
    if (owner && p.emailAddress.toLowerCase() === owner.toLowerCase()) return false;
    return isExternal(p.emailAddress, owner);
  });

  if (externalUsers.length > 0) {
    score += 25;
    reasons.push(
      externalUsers.length === 1
        ? `Shared with someone outside your organisation (${externalUsers[0].emailAddress})`
        : `Shared with ${externalUsers.length} people outside your organisation`,
    );

    const editors = externalUsers.filter(
      (p) => p.role === "writer" || p.role === "fileOrganizer" || p.role === "organizer",
    );
    if (editors.length > 0) {
      score += 15;
      reasons.push("At least one of them can edit, not just view");
    }
  }

  // Google Groups are real access grants. Ignoring them previously made a
  // group-shared file look private ("Only you can access this file").
  const groupShares = permissions.filter((p) => p.type === "group");
  if (groupShares.length > 0) {
    score += 15;
    const editors = groupShares.some(
      (p) =>
        p.role === "writer" ||
        p.role === "fileOrganizer" ||
        p.role === "organizer",
    );
    const label =
      groupShares.length === 1
        ? groupShares[0].emailAddress
          ? `the group ${groupShares[0].emailAddress}`
          : "a Google Group"
        : `${groupShares.length} Google Groups`;
    reasons.push(
      editors
        ? `Shared with ${label}, including edit access`
        : `Shared with ${label}`,
    );
  }

  const collaborators = permissions.filter(
    (p) =>
      p.type === "user" &&
      p.role !== "owner" &&
      (!owner || p.emailAddress?.toLowerCase() !== owner.toLowerCase()),
  );
  if (collaborators.length >= 3) {
    score += 5;
    reasons.push(`${collaborators.length} people have individual access`);
  }

  if (SENSITIVE_NAME.test(file.name)) {
    score += 10;
    reasons.push("The filename suggests this may hold sensitive information");
  }

  if (score === 0) {
    reasons.push("Only you can access this file");
  }

  return { file, score, level: toLevel(score), reasons, sharingKnown: true };
}

export function toLevel(score: number): RiskLevel {
  if (score >= 50) return "HIGH";
  if (score >= 21) return "MEDIUM";
  return "LOW";
}

/**
 * Domain comparison against the signed-in user rather than a hard-coded domain,
 * so the same logic works for any account or Workspace tenant.
 */
function isExternal(email: string, ownerEmail?: string): boolean {
  const ownerDomain = ownerEmail?.split("@")[1]?.toLowerCase();
  const userDomain = email.split("@")[1]?.toLowerCase();
  if (!ownerDomain || !userDomain) return true;
  return ownerDomain !== userDomain;
}
