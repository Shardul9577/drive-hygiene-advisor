import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DuplicateAccumulator,
  RiskAccumulator,
  StorageAccumulator,
} from "../src/services/analysis/accumulators";
import { normalizeFilename } from "../src/services/analysis/duplicates";
import { scoreFile, toLevel } from "../src/services/analysis/risk";
import { assembleReport } from "../src/services/analysis/hygieneService";
import { MOCK_FILES } from "../src/services/drive/mockRepository";
import type { DriveFile } from "../src/types/hygiene";

const OWNER = "demo.user@example.com";

function file(overrides: Partial<DriveFile> & { id: string }): DriveFile {
  return {
    name: "file.bin",
    mimeType: "application/octet-stream",
    permissions: [{ type: "user", role: "owner", emailAddress: OWNER }],
    ...overrides,
  };
}

describe("normalizeFilename", () => {
  it("strips copy/(n)/final decorations so variants collapse together", () => {
    assert.equal(normalizeFilename("invoice copy.pdf"), "invoice");
    assert.equal(normalizeFilename("invoice (1).pdf"), "invoice");
    assert.equal(normalizeFilename("roadmap-final.pptx"), "roadmap");
  });
});

describe("DuplicateAccumulator", () => {
  it("groups identical checksums as a strong match", () => {
    const acc = new DuplicateAccumulator();
    acc.addPage([
      file({ id: "a", name: "report.pdf", size: 100, md5Checksum: "same" }),
      file({ id: "b", name: "report copy.pdf", size: 100, md5Checksum: "same" }),
    ]);

    const [group] = acc.finalise();
    assert.equal(group.confidence, "strong");
    assert.equal(group.files.length, 2);
  });

  it("falls back to name+size when the checksum is missing", () => {
    const acc = new DuplicateAccumulator();
    acc.addPage([
      file({ id: "a", name: "invoice.pdf", mimeType: "application/pdf", size: 2400 }),
      file({ id: "b", name: "invoice (1).pdf", mimeType: "application/pdf", size: 2400 }),
    ]);

    const [group] = acc.finalise();
    assert.equal(group.confidence, "likely");
    assert.equal(group.files.length, 2);
  });

  it("pulls a checksum-less copy into the group its siblings formed", () => {
    // Drive reports md5Checksum for some copies of a file and not others. The
    // copy without one must still be reported, or the most common real-world
    // duplicate is silently dropped.
    const acc = new DuplicateAccumulator();
    acc.addPage([
      file({ id: "a", name: "invoice.pdf", mimeType: "application/pdf", size: 2400, md5Checksum: "bbb" }),
      file({ id: "b", name: "invoice copy.pdf", mimeType: "application/pdf", size: 2400, md5Checksum: "bbb" }),
      file({ id: "c", name: "invoice (1).pdf", mimeType: "application/pdf", size: 2400 }),
    ]);

    const groups = acc.finalise();
    assert.equal(groups.length, 1, "one group, not a strong pair plus an orphan");
    assert.equal(groups[0].files.length, 3);

    // The group is only as strong as its weakest link, and each row says which
    // evidence applied to it.
    assert.equal(groups[0].confidence, "likely");
    const orphan = groups[0].files.find((f) => f.file.id === "c");
    assert.match(orphan!.reason, /no checksum available/i);
    assert.match(groups[0].files.find((f) => f.file.id === "a")!.reason, /checksum match/i);
  });

  it("refuses to bridge when the checksums under one name disagree", () => {
    // Same name, type and size but two different checksums means the files are
    // provably not identical, so there is no honest group to join.
    const acc = new DuplicateAccumulator();
    acc.addPage([
      file({ id: "a", name: "report.pdf", mimeType: "application/pdf", size: 500, md5Checksum: "one" }),
      file({ id: "b", name: "report.pdf", mimeType: "application/pdf", size: 500, md5Checksum: "two" }),
      file({ id: "c", name: "report (1).pdf", mimeType: "application/pdf", size: 500 }),
    ]);

    assert.deepEqual(acc.finalise(), []);
  });

  it("still groups identical bytes stored under unrelated names", () => {
    const acc = new DuplicateAccumulator();
    acc.addPage([
      file({ id: "a", name: "q3-numbers.pdf", size: 90, md5Checksum: "same" }),
      file({ id: "b", name: "board-pack.pdf", size: 90, md5Checksum: "same" }),
    ]);

    const [group] = acc.finalise();
    assert.equal(group.confidence, "strong");
    assert.equal(group.files.length, 2);
  });

  it("counts only redundant copies toward recoverable space", () => {
    const acc = new DuplicateAccumulator();
    acc.addPage([
      file({ id: "a", size: 1000, md5Checksum: "x" }),
      file({ id: "b", size: 1000, md5Checksum: "x" }),
      file({ id: "c", size: 1000, md5Checksum: "x" }),
    ]);

    // Three copies, one worth keeping → two are recoverable.
    assert.equal(acc.finalise()[0].recoverableBytes, 2000);
  });

  it("never groups files that have neither checksum nor size", () => {
    const acc = new DuplicateAccumulator();
    acc.addPage([
      file({ id: "a", name: "Notes", mimeType: "application/vnd.google-apps.document" }),
      file({ id: "b", name: "Notes", mimeType: "application/vnd.google-apps.document" }),
    ]);

    assert.equal(acc.finalise().length, 0);
  });

  it("produces the same groups whether files arrive in one page or several", () => {
    const files = [
      file({ id: "a", size: 100, md5Checksum: "k" }),
      file({ id: "b", size: 100, md5Checksum: "k" }),
      file({ id: "c", size: 100, md5Checksum: "k" }),
    ];

    const single = new DuplicateAccumulator();
    single.addPage(files);

    const paged = new DuplicateAccumulator();
    paged.addPage([files[0]]);
    paged.addPage([files[1], files[2]]);

    assert.deepEqual(
      paged.finalise().map((g) => g.files.length),
      single.finalise().map((g) => g.files.length),
    );
  });
});

describe("exposure scoring", () => {
  it("treats link sharing as HIGH and explains why", () => {
    const result = scoreFile(
      file({
        id: "x",
        name: "brochure.pdf",
        permissions: [
          { type: "user", role: "owner", emailAddress: OWNER },
          { type: "anyone", role: "reader" },
        ],
      }),
      OWNER,
    );

    assert.equal(result.level, "HIGH");
    assert.match(result.reasons[0], /anyone with the link/i);
  });

  it("keeps owner-only files LOW", () => {
    const result = scoreFile(file({ id: "y" }), OWNER);
    assert.equal(result.level, "LOW");
    assert.match(result.reasons[0], /only you/i);
  });

  it("does not reach HIGH on a sensitive filename alone", () => {
    const result = scoreFile(file({ id: "z", name: "payroll.xlsx" }), OWNER);
    assert.notEqual(result.level, "HIGH");
  });

  it("flags unreadable permissions as unknown rather than safe", () => {
    const result = scoreFile(file({ id: "w", permissions: [] }), OWNER);
    assert.match(result.reasons[0], /not available/i);
    assert.equal(result.sharingKnown, false);
  });

  it("judges external by the signed-in user's domain, not a hard-coded one", () => {
    const shared = file({
      id: "v",
      permissions: [
        { type: "user", role: "owner", emailAddress: "me@acme.com" },
        { type: "user", role: "reader", emailAddress: "them@other.com" },
      ],
    });

    assert.ok(scoreFile(shared, "me@acme.com").score > 0);
    // Same file viewed by someone at other.com: the collaborator is internal.
    assert.equal(scoreFile(shared, "me@other.com").score, 0);
  });

  it("scores Google Group shares instead of calling the file private", () => {
    const result = scoreFile(
      file({
        id: "group-shared",
        permissions: [
          { type: "user", role: "owner", emailAddress: OWNER },
          { type: "group", role: "reader", emailAddress: "eng@example.com" },
        ],
      }),
      OWNER,
    );

    assert.ok(result.score > 0);
    assert.match(result.reasons.join(" "), /group/i);
    assert.equal(/only you/i.test(result.reasons.join(" ")), false);
  });

  it("maps scores onto the documented bands", () => {
    assert.equal(toLevel(0), "LOW");
    assert.equal(toLevel(20), "LOW");
    assert.equal(toLevel(21), "MEDIUM");
    assert.equal(toLevel(49), "MEDIUM");
    assert.equal(toLevel(50), "HIGH");
  });
});

describe("StorageAccumulator", () => {
  it("ranks largest first and excludes files with no size", () => {
    const acc = new StorageAccumulator();
    acc.addPage([
      file({ id: "small", size: 10, mimeType: "image/jpeg" }),
      file({ id: "big", size: 9_000, mimeType: "video/mp4" }),
      file({ id: "sizeless", mimeType: "application/vnd.google-apps.document" }),
    ]);

    const { largeFiles, storageByType } = acc.finalise();
    assert.equal(largeFiles[0].file.id, "big");
    assert.equal(largeFiles.length, 2);
    assert.equal(storageByType[0].category, "Videos");
  });

  it("keeps memory bounded by discarding files that cannot place", () => {
    const acc = new StorageAccumulator();
    for (let i = 0; i < 500; i++) {
      acc.addPage([file({ id: `f${i}`, size: i + 1 })]);
    }

    const { largeFiles } = acc.finalise();
    assert.equal(largeFiles.length, 25);
    assert.equal(largeFiles[0].sizeBytes, 500);
  });

  it("charges quota-billed bytes rather than content size", () => {
    // A heavily-revised file bills more than its current version's length.
    const acc = new StorageAccumulator();
    acc.addPage([
      file({ id: "revised", size: 1_000, quotaBytesUsed: 9_000, mimeType: "video/mp4" }),
      file({ id: "plain", size: 5_000, mimeType: "video/mp4" }),
    ]);

    const { largeFiles, storageByType } = acc.finalise();
    assert.equal(largeFiles[0].file.id, "revised", "ranked on billed bytes");
    assert.equal(largeFiles[0].sizeBytes, 9_000);
    assert.equal(storageByType[0].bytes, 14_000);
  });

  it("excludes Google-native files that report zero quota", () => {
    const acc = new StorageAccumulator();
    acc.addPage([
      file({ id: "sheet", size: 400, mimeType: "text/csv" }),
      file({
        id: "gdoc",
        quotaBytesUsed: 0,
        mimeType: "application/vnd.google-apps.document",
      }),
    ]);

    const { largeFiles, storageByType } = acc.finalise();
    assert.equal(largeFiles.length, 1);
    assert.equal(storageByType.length, 1, "no meaningless 0% row");
  });

  it("totals percentages to roughly 100", () => {
    const acc = new StorageAccumulator();
    acc.addPage([
      file({ id: "a", size: 500, mimeType: "video/mp4" }),
      file({ id: "b", size: 500, mimeType: "application/pdf" }),
    ]);

    const total = acc.finalise().storageByType.reduce((sum, s) => sum + s.percent, 0);
    assert.ok(Math.abs(total - 100) < 0.5);
  });
});

describe("RiskAccumulator", () => {
  it("counts every exposed file but retains only the worst offenders", () => {
    const acc = new RiskAccumulator(OWNER);
    for (let i = 0; i < 150; i++) {
      acc.addPage([
        file({
          id: `p${i}`,
          permissions: [
            { type: "user", role: "owner", emailAddress: OWNER },
            { type: "anyone", role: "reader" },
          ],
        }),
      ]);
    }

    const { risks, highCount } = acc.finalise();
    assert.equal(highCount, 150, "counters cover all files");
    assert.equal(risks.length, 100, "retained list stays bounded");
  });

  it("ignores files that are not exposed", () => {
    const acc = new RiskAccumulator(OWNER);
    acc.addPage([file({ id: "private" })]);

    const { risks, highCount, mediumCount } = acc.finalise();
    assert.equal(risks.length, 0);
    assert.equal(highCount + mediumCount, 0);
  });

  it("counts files with unreadable sharing apart from private ones", () => {
    const acc = new RiskAccumulator(OWNER);
    acc.addPage([
      file({ id: "private" }),
      file({ id: "opaque", permissions: [] }),
    ]);

    const { risks, highCount, mediumCount, unknownCount } = acc.finalise();
    assert.equal(unknownCount, 1, "unchecked is reported, not folded into LOW");
    assert.equal(highCount + mediumCount, 0);
    assert.equal(risks.length, 0);
  });
});

describe("report assembly", () => {
  it("builds a coherent report from the mock Drive", () => {
    const duplicates = new DuplicateAccumulator();
    const storage = new StorageAccumulator();
    const risk = new RiskAccumulator(OWNER);

    // Feed in pages of 5 to prove the pipeline never needs the whole dataset.
    for (let i = 0; i < MOCK_FILES.length; i += 5) {
      const page = MOCK_FILES.slice(i, i + 5);
      duplicates.addPage(page);
      storage.addPage(page);
      risk.addPage(page);
    }

    const report = assembleReport({
      duplicates: duplicates.finalise(),
      storage: storage.finalise(),
      risk: risk.finalise(),
      filesAnalysed: MOCK_FILES.length,
      source: "mock",
      pagesFetched: 3,
      pageSize: 5,
      truncated: false,
      warnings: [],
    });

    assert.ok(report.score >= 0 && report.score <= 100);
    assert.equal(report.filesAnalysed, MOCK_FILES.length);
    assert.ok(report.duplicates.length > 0, "mock data contains duplicates");
    assert.ok(report.risks.length > 0, "mock data contains exposed files");
    assert.ok(report.attention.length > 0);
  });

  it("returns a perfect score for an empty Drive instead of dividing by zero", () => {
    const report = assembleReport({
      duplicates: [],
      storage: { largeFiles: [], storageByType: [], largeFilesBytes: 0 },
      risk: { risks: [], highCount: 0, mediumCount: 0, unknownCount: 0 },
      filesAnalysed: 0,
      source: "mock",
      pagesFetched: 0,
      pageSize: 100,
      truncated: false,
      warnings: [],
    });

    assert.equal(report.score, 100);
    assert.equal(report.label, "Excellent");
  });

  it("never drops below zero no matter how bad the Drive is", () => {
    const report = assembleReport({
      duplicates: Array.from({ length: 200 }, (_, i) => ({
        id: `g${i}`,
        confidence: "strong" as const,
        reason: "",
        recoverableBytes: 0,
        files: [],
      })),
      storage: { largeFiles: [], storageByType: [], largeFilesBytes: 0 },
      risk: { risks: [], highCount: 500, mediumCount: 500, unknownCount: 0 },
      filesAnalysed: 1000,
      source: "mock",
      pagesFetched: 10,
      pageSize: 100,
      truncated: true,
      warnings: [],
    });

    assert.ok(report.score >= 0);
  });
});
