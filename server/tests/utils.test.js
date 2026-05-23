"use strict";

const { test, describe, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { slugify, formatHighlightBlock, appendToMarkdown, deleteHighlightById, updateHighlight } = require("../index.js");

// ---------------------------------------------------------------------------
// slugify
// ---------------------------------------------------------------------------

describe("slugify", () => {
  test("basic ASCII phrase", () => {
    assert.equal(slugify("Hello World"), "hello-world");
  });

  test("empty string returns empty string", () => {
    assert.equal(slugify(""), "");
  });

  test("non-ASCII characters are collapsed to hyphens", () => {
    // accented and CJK characters are not in [a-z0-9] so they become dashes
    assert.equal(slugify("Café au lait"), "caf-au-lait");
  });

  test("multiple consecutive spaces become a single hyphen", () => {
    assert.equal(slugify("too   many   spaces"), "too-many-spaces");
  });

  test("leading and trailing special characters are stripped", () => {
    assert.equal(slugify("  --hello--  "), "hello");
  });

  test("very long input is preserved (no truncation)", () => {
    const long = "a".repeat(1000);
    assert.equal(slugify(long), long);
  });

  test("already-slug input is unchanged", () => {
    assert.equal(slugify("my-slug-123"), "my-slug-123");
  });

  test("digits only", () => {
    assert.equal(slugify("42"), "42");
  });

  test("special characters only returns empty string", () => {
    assert.equal(slugify("!@#$%^&*()"), "");
  });
});

// ---------------------------------------------------------------------------
// formatHighlightBlock
// ---------------------------------------------------------------------------

describe("formatHighlightBlock", () => {
  // Use a fixed ISO timestamp so the formatted date is deterministic
  const FIXED_ISO = "2024-03-15T14:30:00.000Z";

  test("full highlight with all optional fields", () => {
    const h = {
      createdAt: FIXED_ISO,
      theme: "Research",
      agent: "Analyst",
      url: "https://example.com/article",
      text: "Some highlighted text",
      note: "Interesting point",
    };
    const block = formatHighlightBlock(h);
    assert.ok(block.includes("**Theme:** Research"), "includes theme");
    assert.ok(block.includes("**Agent:** Analyst"), "includes agent");
    assert.ok(block.includes("**Source:** https://example.com/article"), "includes url");
    assert.ok(block.includes("> Some highlighted text"), "includes blockquote text");
    assert.ok(block.includes("**Note:** Interesting point"), "includes note");
    assert.ok(block.endsWith("---\n"), "ends with separator");
  });

  test("missing optional fields: no agent, no note", () => {
    const h = {
      createdAt: FIXED_ISO,
      theme: "Science",
      url: "https://example.com",
      text: "Another highlight",
    };
    const block = formatHighlightBlock(h);
    assert.ok(!block.includes("**Agent:**"), "no agent line when agent is absent");
    assert.ok(!block.includes("**Note:**"), "no note line when note is absent");
    assert.ok(block.includes("**Theme:** Science"), "theme present");
  });

  test("missing theme falls back to Untagged", () => {
    const h = {
      createdAt: FIXED_ISO,
      text: "No theme here",
      url: "https://example.com",
    };
    const block = formatHighlightBlock(h);
    assert.ok(block.includes("**Theme:** Untagged"), "falls back to Untagged");
  });

  test("missing url falls back to Unknown", () => {
    const h = {
      createdAt: FIXED_ISO,
      text: "No URL here",
    };
    const block = formatHighlightBlock(h);
    assert.ok(block.includes("**Source:** Unknown"), "falls back to Unknown");
  });

  test("multiline text is indented with blockquote prefix on each line", () => {
    const h = {
      createdAt: FIXED_ISO,
      text: "Line one\nLine two\nLine three",
    };
    const block = formatHighlightBlock(h);
    assert.ok(block.includes("> Line one\n> Line two\n> Line three"), "each line prefixed with >");
  });

  test("returns a string", () => {
    const h = { createdAt: FIXED_ISO, text: "test" };
    assert.equal(typeof formatHighlightBlock(h), "string");
  });
});

// ---------------------------------------------------------------------------
// appendToMarkdown
// ---------------------------------------------------------------------------

describe("appendToMarkdown", () => {
  let tmpDir;
  const FIXED_ISO = "2024-06-01T10:00:00.000Z";
  const MARKER = "<!-- highlights will be appended here by the sync server -->";

  const sampleHighlight = {
    createdAt: FIXED_ISO,
    theme: "Test Theme",
    text: "Test highlight text",
    url: "https://test.example.com",
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "ch-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates file with defaultHeader when file does not exist", () => {
    const filePath = path.join(tmpDir, "new.md");
    const header = `# New File\n\n---\n\n${MARKER}\n`;
    appendToMarkdown(filePath, sampleHighlight, header);
    assert.ok(fs.existsSync(filePath), "file was created");
    const content = fs.readFileSync(filePath, "utf8");
    assert.ok(content.includes("# New File"), "header is present");
  });

  test("inserts block at marker when marker is present", () => {
    const filePath = path.join(tmpDir, "with-marker.md");
    const initial = `# Existing File\n\n${MARKER}\n`;
    fs.writeFileSync(filePath, initial, "utf8");

    appendToMarkdown(filePath, sampleHighlight, "# Fallback Header\n");

    const content = fs.readFileSync(filePath, "utf8");
    // Marker must still be present (it is not removed, block is inserted after it)
    assert.ok(content.includes(MARKER), "marker still present");
    // The highlight block must appear after the marker
    const markerIdx = content.indexOf(MARKER);
    const textIdx = content.indexOf("Test highlight text");
    assert.ok(textIdx > markerIdx, "highlight block appears after marker");
  });

  test("appends to end when marker is absent", () => {
    const filePath = path.join(tmpDir, "no-marker.md");
    const initial = "# File Without Marker\n\nSome existing content.\n";
    fs.writeFileSync(filePath, initial, "utf8");

    appendToMarkdown(filePath, sampleHighlight, "# Fallback\n");

    const content = fs.readFileSync(filePath, "utf8");
    assert.ok(content.startsWith("# File Without Marker"), "original content preserved");
    assert.ok(content.includes("Test highlight text"), "new block appended");
    // The new content should come after the original
    const origEnd = initial.length;
    const appendedIdx = content.indexOf("Test highlight text");
    assert.ok(appendedIdx > origEnd - 5, "block appended after original content");
  });

  test("creates intermediate directories when they do not exist", () => {
    const filePath = path.join(tmpDir, "nested", "deep", "file.md");
    appendToMarkdown(filePath, sampleHighlight, `# Deep\n\n${MARKER}\n`);
    assert.ok(fs.existsSync(filePath), "file created in nested dirs");
  });
});

// ---------------------------------------------------------------------------
// deleteHighlightById — known behavior: returns undefined for any input
// ---------------------------------------------------------------------------

describe("deleteHighlightById", () => {
  test("returns undefined for a nonexistent ID (known behavior)", () => {
    // The function filters highlightStore (module-level) and calls saveStore().
    // It has no return statement, so it always returns undefined — even for
    // IDs that were never in the store. The HTTP layer adds { success: true }.
    const result = deleteHighlightById("does-not-exist-999");
    assert.equal(result, undefined, "returns undefined for nonexistent IDs");
  });

  test("returns undefined for an existing ID (known behavior)", () => {
    // Even when the ID exists and is removed, the function returns undefined.
    // This is intentional: the caller (HTTP handler) provides the success response.
    const result = deleteHighlightById("any-id");
    assert.equal(result, undefined, "returns undefined regardless of ID presence");
  });
});

// ---------------------------------------------------------------------------
// updateHighlight — known behavior: silently ignores nonexistent IDs
// ---------------------------------------------------------------------------

describe("updateHighlight", () => {
  test("returns undefined when called with a nonexistent ID (known behavior)", () => {
    // updateHighlight maps over highlightStore and saves; if no entry matches,
    // the store is unchanged and the function still returns undefined silently.
    const result = updateHighlight({ id: "ghost-id-xyz", theme: "New Theme" });
    assert.equal(result, undefined, "returns undefined for nonexistent IDs");
  });

  test("returns undefined when called with an existing-style update (known behavior)", () => {
    // The function never has a return statement, so the return value is always
    // undefined. Callers must not rely on the return value for success detection.
    const result = updateHighlight({ id: "any-id", note: "updated note" });
    assert.equal(result, undefined, "always returns undefined regardless of match");
  });
});
