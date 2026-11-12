// Fixture AppImages for tests: executable shell scripts honouring --appimage-extract.
// See implementation/active/core-cli-v1/sources/testsupport.fixtures.md.
import { chmod, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const FIXTURES_ROOT = path.resolve(import.meta.dir, "appdirs");

export type FixtureAppdir = "valid" | "no-desktop" | "no-icons";

export interface FixtureOptions {
  /** Model an invalid AppImage: any invocation fails. */
  readonly garbage?: boolean;
}

export async function makeFixtureAppImage(
  appdir: FixtureAppdir | null,
  destPath: string,
  opts?: FixtureOptions,
): Promise<string> {
  let script: string;
  if (opts?.garbage) {
    script = "#!/bin/sh\necho 'not an appimage' >&2\nexit 1\n";
  } else {
    if (appdir === null) throw new Error("programmer error: appdir required unless garbage");
    const sourceDir = path.join(FIXTURES_ROOT, appdir);
    script = `#!/bin/sh
case "$1" in
  --appimage-extract)
    rm -rf squashfs-root
    mkdir -p squashfs-root
    cp -R "${sourceDir}/." squashfs-root/
    ;;
  *)
    echo "fake payload"
    ;;
esac
`;
  }
  await mkdir(path.dirname(destPath), { recursive: true });
  await writeFile(destPath, script, { mode: 0o755 });
  await chmod(destPath, 0o755);
  return destPath;
}
