import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  fallbackEntry,
  listEntries,
  parseDesktopEntry,
  readEntry,
  removeEntry,
  renderDesktopEntry,
  writeEntry,
} from "../../src/core/desktop.ts";

const SAMPLE = `[Desktop Entry]
Type=Application
Name=VSCodium
Name[de]=VSCodium DE
Comment=Code editing. Redefined.
Exec=codium %U
Icon=codium
Categories=Development;IDE;
Terminal=false
X-AppImage-Version=1.2.3
X-Custom-Flag=yes
`;

describe("core.desktop parse/render", () => {
  test("parses known keys and preserves the rest", () => {
    const r = parseDesktopEntry("codium", SAMPLE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toBe("codium");
    expect(r.value.name).toBe("VSCodium");
    expect(r.value.comment).toBe("Code editing. Redefined.");
    expect(r.value.exec).toBe("codium %U");
    expect(r.value.icon).toBe("codium");
    expect(r.value.categories).toEqual(["Development", "IDE"]);
    expect(r.value.terminal).toBe(false);
    expect(r.value.version).toBe("1.2.3");
    expect(r.value.extra["Name[de]"]).toBe("VSCodium DE");
    expect(r.value.extra["X-Custom-Flag"]).toBe("yes");
    expect(r.value.extra["Type"]).toBe("Application"); // unknown keys preserved verbatim
  });

  test("missing Name is a structured error", () => {
    const r = parseDesktopEntry("x", "[Desktop Entry]\nExec=foo\n");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.kind).toBe("missing-name");
  });

  test("empty text and groupless text are empty-entry", () => {
    for (const text of ["", "Name=NoGroup\n", "[Other]\nKey=Value\n"]) {
      const r = parseDesktopEntry("x", text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error.kind).toBe("empty-entry");
    }
  });

  test("round-trips preserved fields through render with overrides", () => {
    const parsed = parseDesktopEntry("codium", SAMPLE);
    if (!parsed.ok) throw new Error("parse failed");
    const rendered = renderDesktopEntry(parsed.value, { exec: "/opt/codium.appimage", icon: "codium" });
    expect(rendered.endsWith("\n")).toBe(true);
    expect(rendered).toContain("Exec=/opt/codium.appimage");
    expect(rendered).toContain("Icon=codium");
    expect(rendered).toContain("Name[de]=VSCodium DE");
    expect(rendered).toContain("X-AppImage-Version=1.2.3");
    expect(rendered).toContain("Categories=Development;IDE;");
    const again = parseDesktopEntry("codium", rendered);
    expect(again.ok).toBe(true);
    if (again.ok) {
      expect(again.value.name).toBe("VSCodium");
      expect(again.value.version).toBe("1.2.3");
      expect(again.value.extra["Name[de]"]).toBe("VSCodium DE");
    }
  });

  test("fallbackEntry strips extension and tidies separators", () => {
    expect(fallbackEntry("foo", "Foo_Bar-1.2.3.AppImage").name).toBe("Foo Bar 1.2.3");
    expect(fallbackEntry("x", ".AppImage").name).toBe("x");
  });
});

describe("core.desktop fs operations", () => {
  test("write/read/remove/list round trip", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "desktop-test-"));
    try {
      const entry = parseDesktopEntry("codium", SAMPLE);
      if (!entry.ok) throw new Error("parse failed");
      const rendered = renderDesktopEntry(entry.value, { exec: "/x/codium.appimage", icon: "codium" });

      expect((await readEntry(dir, "codium")).ok).toBe(true);
      const before = await readEntry(dir, "codium");
      if (before.ok) expect(before.value).toBeNull();

      expect((await writeEntry(dir, "codium", rendered)).ok).toBe(true);
      const read = await readEntry(dir, "codium");
      expect(read.ok).toBe(true);
      if (read.ok && read.value) expect(read.value.name).toBe("VSCodium");

      const listed = await listEntries(dir);
      expect(listed.ok).toBe(true);
      if (listed.ok) expect(listed.value.map((e) => e.id)).toEqual(["codium"]);

      expect((await removeEntry(dir, "codium")).ok).toBe(true);
      const again = await removeEntry(dir, "codium");
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.value).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("listEntries skips unparseable files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "desktop-test-"));
    try {
      await writeEntry(dir, "good", renderDesktopEntry(fallbackEntry("good", "good.appimage"), { exec: "/x", icon: "x" }));
      await Bun.write(path.join(dir, "bad.desktop"), "[Desktop Entry]\nExec=only\n");
      const listed = await listEntries(dir);
      expect(listed.ok).toBe(true);
      if (listed.ok) expect(listed.value.map((e) => e.id)).toEqual(["good"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
