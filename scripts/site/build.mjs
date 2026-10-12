import { cp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const sourceDirectory = path.join(projectRoot, 'site');
const outputParent = path.join(projectRoot, '.output');
const outputDirectory = path.join(outputParent, 'site');

// Keep one policy source for the extension package and the public website.
const [homeTemplate, shell, privacyDocument] = await Promise.all([
  readFile(path.join(sourceDirectory, 'index.html'), 'utf8'),
  readFile(path.join(sourceDirectory, 'privacy-shell.html'), 'utf8'),
  readFile(path.join(projectRoot, 'public/privacy.html'), 'utf8'),
]);
const home = await includePartials(homeTemplate);
const privacyBody = privacyDocument.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1];
const placeholder = '{{PRIVACY_CONTENT}}';
if (!privacyBody || shell.split(placeholder).length !== 2) {
  throw new Error('Expected a policy body and exactly one privacy content placeholder.');
}

await mkdir(outputParent, { recursive: true });
const actualRoot = await realpath(projectRoot);
const actualOutputParent = await realpath(outputParent);
if (actualOutputParent !== path.join(actualRoot, '.output')) {
  throw new Error('Refusing to clean a website output directory outside the project.');
}
await rm(outputDirectory, { recursive: true, force: true });
await mkdir(path.join(outputDirectory, 'assets'), { recursive: true });
await Promise.all([
  writeFile(path.join(outputDirectory, 'index.html'), home),
  writeFile(
    path.join(outputDirectory, 'privacy.html'),
    shell.replace(placeholder, () => privacyBody.trim()),
  ),
  writeFile(path.join(outputDirectory, '.nojekyll'), ''),
  cp(path.join(sourceDirectory, 'sitemap.xml'), path.join(outputDirectory, 'sitemap.xml')),
  cp(path.join(sourceDirectory, 'assets'), path.join(outputDirectory, 'assets'), {
    recursive: true,
  }),
]);
await cp(
  path.join(projectRoot, 'public/icon/128.png'),
  path.join(outputDirectory, 'assets/icon.png'),
);
console.log('Website built in .output/site (home, privacy policy, and local assets).');

async function includePartials(template) {
  let rendered = template;
  const actualSource = await realpath(sourceDirectory);
  for (const match of template.matchAll(/<!--\s*include:\s*(.*?)\s*-->/g)) {
    const reference = match[1];
    if (!/^partials\/[a-z0-9-]+\.html$/.test(reference)) {
      throw new Error(`Invalid partial reference: ${reference}`);
    }
    const file = path.join(actualSource, reference);
    if ((await realpath(file)) !== file) {
      throw new Error(`Partial must be a regular project file: ${reference}`);
    }
    const content = await readFile(file, 'utf8');
    if (/<!--\s*include:/.test(content)) throw new Error('Nested partials are not supported.');
    rendered = rendered.replace(match[0], () => content);
  }
  return rendered;
}
