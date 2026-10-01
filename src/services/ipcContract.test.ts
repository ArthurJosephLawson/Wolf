/**
 * IPC contract test.
 *
 * Nothing in the toolchain checks that the command names and argument keys used
 * in TypeScript still exist in Rust. Tauri resolves both at runtime, so a typo
 * or a rename is a production-only failure that unit tests would never see.
 * This test parses both sides and compares them, which makes the seam a
 * compile-time-like guarantee instead of a runtime surprise.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

/** Walk up to the directory holding `package.json`, so the test survives a move. */
function repoRoot(): string {
  let dir = import.meta.dirname;
  while (!existsSync(join(dir, "package.json"))) {
    const parent = dirname(dir);
    if (parent === dir) throw new Error("no package.json above this test");
    dir = parent;
  }
  return dir;
}

const ROOT = repoRoot();
const SRC = join(ROOT, "src");
const RUST_SRC = join(ROOT, "src-tauri", "src");

/** Every `invoke("name", { key: ... })` / `invoke("name")` call in the frontend. */
function invokedCommands(): {
  command: string;
  args: string[];
  file: string;
}[] {
  const found: { command: string; args: string[]; file: string }[] = [];
  const call = /invoke(?:<[^>]*>)?\(\s*"([a-z0-9_]+)"\s*(?:,\s*\{([^}]*)\})?/g;

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name) || entry.name.endsWith(".test.ts"))
        continue;

      const source = readFileSync(path, "utf8");
      for (const match of source.matchAll(call)) {
        const command = match[1];
        if (command === undefined) continue;
        const argBlock = match[2];
        const args = argBlock
          ? [...argBlock.matchAll(/(?:^|[{,])\s*([A-Za-z0-9_]+)\s*[:,}]/g)].map(
              (m) => m[1] as string,
            )
          : [];
        found.push({ command, args, file: path });
      }
    }
  };

  walk(SRC);
  return found;
}

/** Command fn names registered with `generate_handler!`. */
function registeredCommands(): Set<string> {
  const lib = readFileSync(join(RUST_SRC, "lib.rs"), "utf8");
  const block = lib.match(/generate_handler!\[([\s\S]*?)\]\)/)?.[1] ?? "";
  return new Set(
    [...block.matchAll(/([a-z0-9_]+)\s*,\s*$/gm)].map((m) => m[1] as string),
  );
}

/** The function name and non-injected parameter names of a command. */
function commandSignature(name: string): string[] | null {
  const pattern = new RegExp(`pub (?:async )?fn ${name}\\s*\\(([^)]*)\\)`);
  for (const file of readdirSync(join(RUST_SRC, "commands"))) {
    if (!file.endsWith(".rs")) continue;
    const source = readFileSync(join(RUST_SRC, "commands", file), "utf8");
    const params = source.match(pattern)?.[1];
    if (params === undefined) continue;

    return params
      .split(",")
      .map((param) => param.trim())
      .filter((param) => param.length > 0 && !param.endsWith(": &str"))
      .filter((param) => !/^(app|state|window|channel)\b/.test(param))
      .map((param) => param.split(":")[0]!.trim())
      .filter((param) => param !== "self");
  }
  return null;
}

/** Tauri converts command arguments to camelCase on the JS side. */
function toCamelCase(snake: string): string {
  return snake.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

describe("IPC contract", () => {
  const calls = invokedCommands();
  const registered = registeredCommands();

  it("finds the frontend command calls to check", () => {
    expect(calls.length).toBeGreaterThan(40);
    expect(registered.size).toBeGreaterThan(40);
  });

  it("only invokes commands that are registered in Rust", () => {
    const unknown = calls
      .filter((call) => !registered.has(call.command))
      .map((call) => `${call.command} (${call.file})`);
    expect(unknown).toEqual([]);
  });

  it("passes argument keys the Rust command actually accepts", () => {
    const problems: string[] = [];

    for (const call of calls) {
      const params = commandSignature(call.command);
      if (params === null) {
        problems.push(
          `${call.command}: signature not found in src-tauri/src/commands`,
        );
        continue;
      }
      // `State`/`AppHandle`/`Channel` are injected, so a param list of only
      // injected values means the command takes no arguments.
      const accepted = new Set(params.map(toCamelCase));
      for (const arg of call.args) {
        if (!accepted.has(arg)) {
          problems.push(
            `${call.command}("${arg}") not accepted; Rust takes: ${
              [...accepted].join(", ") || "(none)"
            }`,
          );
        }
      }
    }

    expect(problems).toEqual([]);
  });
});
