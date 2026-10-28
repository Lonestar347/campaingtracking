import { describe, expect, it } from "vitest";
import {
  detectLinkType,
  emptyLinkForm,
  shortUrl,
  toLookerEmbedUrl,
  validateLinkForm,
} from "@/lib/links";

describe("detectLinkType", () => {
  it.each([
    ["https://acme.frontify.com/document/123", "frontify"],
    ["https://frontify.com/x", "frontify"],
    ["https://acme.sharepoint.com/sites/marketing/Shared%20Documents", "sharepoint"],
    ["https://acme-my.sharepoint.com/personal/x", "sharepoint"],
    ["https://lookerstudio.google.com/reporting/abc", "looker_studio"],
    ["https://datastudio.google.com/u/0/reporting/abc", "looker_studio"],
    ["https://notfrontify.com/x", "other"],
    ["https://frontify.com.evil.example/x", "other"],
    ["kein link", "other"],
  ])("%s -> %s", (url, type) => {
    expect(detectLinkType(url)).toBe(type);
  });
});

describe("toLookerEmbedUrl", () => {
  it("converts report URLs, keeping page and query", () => {
    expect(toLookerEmbedUrl("https://lookerstudio.google.com/reporting/abc-123/page/p_xyz")).toBe(
      "https://lookerstudio.google.com/embed/reporting/abc-123/page/p_xyz",
    );
    expect(toLookerEmbedUrl("https://datastudio.google.com/u/0/reporting/abc?params=%7B%7D")).toBe(
      "https://lookerstudio.google.com/embed/reporting/abc?params=%7B%7D",
    );
  });

  it("keeps embed URLs and rejects other URLs", () => {
    expect(toLookerEmbedUrl("https://lookerstudio.google.com/embed/reporting/abc")).toBe(
      "https://lookerstudio.google.com/embed/reporting/abc",
    );
    expect(toLookerEmbedUrl("https://lookerstudio.google.com/navigation/reporting")).toBeNull();
    expect(toLookerEmbedUrl("https://example.com/reporting/abc")).toBeNull();
    expect(toLookerEmbedUrl("nope")).toBeNull();
  });
});

describe("shortUrl", () => {
  it("shortens long paths", () => {
    expect(shortUrl("https://acme.frontify.com/a/b/herbst")).toBe("acme.frontify.com/…/herbst");
    expect(shortUrl("https://example.com/x")).toBe("example.com/x");
    expect(shortUrl("https://example.com/")).toBe("example.com");
  });
});

describe("validateLinkForm", () => {
  it("detects the type when none is chosen", () => {
    const result = validateLinkForm({ ...emptyLinkForm(), url: " https://acme.sharepoint.com/sites/x " });
    expect(result).toEqual({
      success: true,
      data: { url: "https://acme.sharepoint.com/sites/x", type: "sharepoint", label: null, thumbnailUrl: null, embed: false },
    });
  });

  it("keeps an explicit type and ignores embed for non-Looker links", () => {
    const result = validateLinkForm({ ...emptyLinkForm(), url: "https://example.com/doc", type: "frontify", embed: true });
    expect(result.success && result.data).toMatchObject({ type: "frontify", embed: false });
  });

  it("validates url, thumbnail and embeddability", () => {
    const empty = validateLinkForm(emptyLinkForm());
    expect(!empty.success && empty.errors).toEqual({ url: "Enter a URL" });

    const invalid = validateLinkForm({ ...emptyLinkForm(), url: "ftp://x", thumbnailUrl: "bild.png" });
    expect(!invalid.success && Object.keys(invalid.errors).sort()).toEqual(["thumbnailUrl", "url"]);

    const notEmbeddable = validateLinkForm({
      ...emptyLinkForm(),
      url: "https://lookerstudio.google.com/navigation/reporting",
      embed: true,
    });
    expect(!notEmbeddable.success && notEmbeddable.errors.embed).toMatch(/report link/);
  });
});
