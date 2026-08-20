import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const findMarkdownFiles = async () => {
  const docsDirectory = join(repositoryRoot, 'docs');
  const docsEntries = await readdir(docsDirectory, { withFileTypes: true });
  const docsFiles = docsEntries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(docsDirectory, entry.name))
    .sort();
  return [join(repositoryRoot, 'README.md'), join(repositoryRoot, 'FLOWS.md'), ...docsFiles];
};

const findMermaidBlocks = (markdown) =>
  [...markdown.matchAll(/^```mermaid\s*\r?\n([\s\S]*?)^```\s*$/gm)].map((match) => match[1]);

const requireAccessibilityMetadata = (diagram, location) => {
  for (const directive of ['accTitle', 'accDescr']) {
    const pattern = new RegExp(`^\\s*${directive}:\\s*\\S`, 'm');
    if (!pattern.test(diagram)) {
      throw new Error(`${location}: missing non-empty ${directive} directive`);
    }
  }
};

const syntaxOnlyDiagram = (diagram) => diagram.replace(/^\s*acc(?:Title|Descr):.*(?:\r?\n|$)/gm, '');

const validateDiagrams = async () => {
  let diagramCount = 0;
  const failures = [];

  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({ startOnLoad: false });
  for (const sourcePath of await findMarkdownFiles()) {
    const sourceName = relative(repositoryRoot, sourcePath);
    const markdown = await readFile(sourcePath, 'utf8');
    const diagrams = findMermaidBlocks(markdown);
    for (const [index, diagram] of diagrams.entries()) {
      const location = `${sourceName}: Mermaid block ${index + 1}`;
      try {
        requireAccessibilityMetadata(diagram, location);
      } catch (error) {
        failures.push(error.message);
      }
      try {
        // Mermaid's Node parser can validate graph syntax without a browser. Its
        // accessibility sanitizer requires a DOM, so validate those directives
        // above and omit them only from this syntax-only parse.
        await mermaid.parse(syntaxOnlyDiagram(diagram));
      } catch (error) {
        failures.push(`${location}: ${error.message}`);
      }
      diagramCount += 1;
    }
  }

  if (failures.length > 0) {
    throw new Error(`\n${failures.join('\n\n')}`);
  }
  dom.window.close();
  console.log(`Validated ${diagramCount} Mermaid diagrams.`);
};

validateDiagrams().catch((error) => {
  console.error(`Mermaid validation failed: ${error.message}`);
  process.exitCode = 1;
});
