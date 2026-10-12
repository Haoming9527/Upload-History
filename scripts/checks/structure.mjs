import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const MAX_LINES = 500;
const codeExtensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.css', '.html']);

async function sourceFiles(directory, recursive = true) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) return recursive ? sourceFiles(file) : [];
      return codeExtensions.has(path.extname(file)) ? [file] : [];
    }),
  );
  return files.flat();
}

// Check authored source and tests, not generated bundles, dependencies, or lockfiles.
const files = (
  await Promise.all([
    sourceFiles('.', false),
    ...['src', 'entrypoints', 'scripts', 'tests', 'public'].map((directory) =>
      sourceFiles(directory),
    ),
  ])
).flat();
const sizes = await Promise.all(
  files.map(async (file) => ({
    file,
    lines: (await readFile(file, 'utf8')).trimEnd().split(/\r?\n/).length,
  })),
);
const oversized = sizes.filter(({ lines }) => lines > MAX_LINES);
if (oversized.length) {
  for (const { file, lines } of oversized)
    console.error(`${file}: ${lines} lines (max ${MAX_LINES})`);
  console.error('Split files by responsibility; do not compress code to bypass the limit.');
  process.exitCode = 1;
} else {
  const largest = sizes.reduce((a, b) => (a.lines > b.lines ? a : b));
  console.log(`Checked ${files.length} code files: all at or below ${MAX_LINES} lines.`);
  console.log(`Largest: ${largest.file} (${largest.lines} lines).`);
}
