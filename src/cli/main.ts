#!/usr/bin/env bun
import { runCli } from "./run.ts";

const code = await runCli(process.argv.slice(2), {
  io: { stdout: console.log, stderr: console.error },
});
process.exit(code);
