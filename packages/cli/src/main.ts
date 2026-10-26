#!/usr/bin/env bun
import { runCli } from "./index.ts";

const result = await runCli(Bun.argv.slice(2));
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = result.code;
