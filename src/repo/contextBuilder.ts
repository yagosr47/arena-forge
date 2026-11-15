export interface ScannedSourceFile {
  path: string;
  size: number;
  content: string;
}

export interface ExtractedSymbol {
  kind: 'interface' | 'type' | 'function' | 'class' | 'enum';
  name: string;
  signature: string;
  line: number;
}

export interface FileSignatureReport {
  path: string;
  size: number;
  symbols: ExtractedSymbol[];
}

export interface ContextBuildOptions {
  ignoreDirs: string[];
  includePackageJson: boolean;
  includeTypesAndInterfaces: boolean;
  includeFunctions: boolean;
  includeClassesAndEnums: boolean;
  maxInterfaceLines: number;
}

export interface ContextBuildResult {
  projectName: string;
  totalFilesScanned: number;
  ignoredCount: number;
  codeFileCount: number;
  totalSymbols: number;
  estimatedTokens: number;
  treeText: string;
  reports: FileSignatureReport[];
  markdown: string;
}

export const DEFAULT_IGNORE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.vite',
  '.cache',
  'coverage',
  '__pycache__',
  '.venv',
  'target',
  'out',
];

const IGNORED_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  '.ds_store',
]);

const CODE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.vue',
  '.svelte',
]);

const TEXT_TREE_EXTENSIONS = new Set([
  ...CODE_EXTENSIONS,
  '.json',
  '.md',
  '.css',
  '.scss',
  '.html',
  '.yaml',
  '.yml',
  '.toml',
  '.sql',
  '.glsl',
  '.wgsl',
  '.sh',
  '.env.example',
]);

export function shouldIgnorePath(relPath: string, ignoreDirs: string[] = DEFAULT_IGNORE_DIRS): boolean {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  const lowerIgnore = new Set(ignoreDirs.map((d) => d.toLowerCase()));

  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i].toLowerCase();
    if (lowerIgnore.has(seg)) return true;
    if (i === parts.length - 1) {
      if (IGNORED_FILES.has(seg)) return true;
      if (seg.endsWith('.min.js') || seg.endsWith('.min.css')) return true;
    }
  }
  return false;
}

function getExtension(filePath: string): string {
  const base = filePath.split('/').pop()?.toLowerCase() ?? '';
  const dot = base.lastIndexOf('.');
  return dot >= 0 ? base.slice(dot) : '';
}

function isCodeFile(filePath: string): boolean {
  return CODE_EXTENSIONS.has(getExtension(filePath));
}

function isReadableProjectFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('package.json')) return true;
  return TEXT_TREE_EXTENSIONS.has(getExtension(filePath));
}

/** Read files from <input webkitdirectory multiple> or drag-and-drop FileList. */
export async function collectFilesFromFileList(
  fileList: FileList | File[],
  ignoreDirs: string[] = DEFAULT_IGNORE_DIRS
): Promise<{ files: ScannedSourceFile[]; ignoredCount: number; rootName: string }> {
  const list = Array.from(fileList);
  const files: ScannedSourceFile[] = [];
  let ignoredCount = 0;
  let rootName = 'projeto-local';

  for (const file of list) {
    const rawRel =
      (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
    const cleaned = rawRel.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!cleaned) continue;

    const segments = cleaned.split('/');
    if (segments.length > 1 && rootName === 'projeto-local') {
      rootName = segments[0];
    }

    if (shouldIgnorePath(cleaned, ignoreDirs)) {
      ignoredCount++;
      continue;
    }

    // Keep all non-ignored files in tree; only read text for source/package.json under 1.5MB
    const needsContent =
      (isCodeFile(cleaned) || cleaned.toLowerCase().endsWith('package.json')) &&
      file.size <= 1_500_000;

    let content = '';
    if (needsContent) {
      try {
        content = await file.text();
      } catch {
        content = '';
      }
    }

    files.push({
      path: segments.length > 1 ? segments.slice(1).join('/') : cleaned,
      size: file.size,
      content,
    });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, ignoredCount, rootName };
}

/** Read directory recursively via File System Access API with immediate pruning of node_modules & .git. */
export async function collectFilesFromDirectoryHandle(
  dirHandle: FileSystemDirectoryHandle,
  ignoreDirs: string[] = DEFAULT_IGNORE_DIRS
): Promise<{ files: ScannedSourceFile[]; ignoredCount: number; rootName: string }> {
  const files: ScannedSourceFile[] = [];
  let ignoredCount = 0;
  const lowerIgnore = new Set(ignoreDirs.map((d) => d.toLowerCase()));

  async function walk(handle: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    const iter = (
      handle as unknown as {
        values(): AsyncIterableIterator<FileSystemHandle>;
      }
    ).values();

    for await (const entry of iter) {
      const name = entry.name;
      const relPath = prefix ? `${prefix}/${name}` : name;

      if (entry.kind === 'directory') {
        if (lowerIgnore.has(name.toLowerCase())) {
          ignoredCount++;
          continue;
        }
        await walk(entry as FileSystemDirectoryHandle, relPath);
      } else if (entry.kind === 'file') {
        if (shouldIgnorePath(relPath, ignoreDirs)) {
          ignoredCount++;
          continue;
        }
        const file = await (entry as FileSystemFileHandle).getFile();
        const needsContent =
          (isCodeFile(relPath) || relPath.toLowerCase().endsWith('package.json')) &&
          file.size <= 1_500_000;
        let content = '';
        if (needsContent) {
          try {
            content = await file.text();
          } catch {
            content = '';
          }
        }
        files.push({ path: relPath, size: file.size, content });
      }
    }
  }

  await walk(dirHandle, '');
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files, ignoredCount, rootName: dirHandle.name || 'projeto-local' };
}

interface TreeNode {
  name: string;
  children: Map<string, TreeNode>;
  isFile: boolean;
}

/** Build Unicode directory tree from flat relative paths. */
export function buildDirectoryTree(paths: string[], rootName = 'project'): string {
  const root: TreeNode = { name: rootName, children: new Map(), isFile: false };

  for (const rawPath of paths) {
    const parts = rawPath.split('/').filter(Boolean);
    let curr = root;
    parts.forEach((part, idx) => {
      let next = curr.children.get(part);
      if (!next) {
        next = { name: part, children: new Map(), isFile: idx === parts.length - 1 };
        curr.children.set(part, next);
      }
      curr = next;
    });
  }

  const lines: string[] = [`${rootName}/`];

  const render = (node: TreeNode, prefix: string) => {
    const entries = Array.from(node.children.values()).sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });

    entries.forEach((entry, idx) => {
      const isLast = idx === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      lines.push(`${prefix}${connector}${entry.name}${entry.isFile ? '' : '/'}`);
      if (!entry.isFile) {
        render(entry, prefix + (isLast ? '    ' : '│   '));
      }
    });
  };

  render(root, '');
  return lines.join('\n');
}

/** Strip line/block comments while preserving line numbers so symbol extraction stays accurate. */
function stripCommentsPreserveLines(source: string): string {
  let out = '';
  let i = 0;
  const len = source.length;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;

  while (i < len) {
    const ch = source[i];
    const next = source[i + 1];

    if (inSingle) {
      out += ch;
      if (ch === '\\' && i + 1 < len) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === "'") inSingle = false;
      i++;
      continue;
    }

    if (inDouble) {
      out += ch;
      if (ch === '\\' && i + 1 < len) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === '"') inDouble = false;
      i++;
      continue;
    }

    if (inTemplate) {
      out += ch;
      if (ch === '\\' && i + 1 < len) {
        out += next;
        i += 2;
        continue;
      }
      if (ch === '`') inTemplate = false;
      i++;
      continue;
    }

    if (ch === '/' && next === '/') {
      while (i < len && source[i] !== '\n') i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }

    if (ch === "'") inSingle = true;
    else if (ch === '"') inDouble = true;
    else if (ch === '`') inTemplate = true;

    out += ch;
    i++;
  }

  return out;
}

function captureBlock(lines: string[], startIdx: number, maxLines: number): string {
  let depth = 0;
  let opened = false;
  const collected: string[] = [];

  for (let i = startIdx; i < lines.length && collected.length < maxLines; i++) {
    const line = lines[i];
    collected.push(line);
    for (const ch of line) {
      if (ch === '{') {
        depth++;
        opened = true;
      } else if (ch === '}') {
        depth--;
      }
    }
    if (opened && depth <= 0) break;
  }

  if (opened && depth > 0) {
    collected.push('  /* ... */');
    collected.push('}');
  }
  return collected.join('\n').trim();
}

function captureFunctionHeader(lines: string[], startIdx: number): string {
  let parenDepth = 0;
  let sawParen = false;
  const parts: string[] = [];

  for (let i = startIdx; i < Math.min(lines.length, startIdx + 12); i++) {
    const raw = lines[i];
    parts.push(raw.trim());
    for (const ch of raw) {
      if (ch === '(') {
        parenDepth++;
        sawParen = true;
      } else if (ch === ')') {
        parenDepth--;
      }
    }
    if (sawParen && parenDepth <= 0 && (raw.includes('{') || raw.includes('=>') || raw.trim().endsWith(';'))) {
      break;
    }
  }

  const joined = parts.join(' ').replace(/\s+/g, ' ');
  // Trim function body starting at opening brace (not type object literal inside return type)
  const arrowIdx = joined.indexOf('=>');
  if (arrowIdx !== -1 && !joined.startsWith('export function') && !joined.startsWith('export async function')) {
    return joined.slice(0, arrowIdx + 2).trim();
  }
  // Find body `{` after closing `)`
  let pDepth = 0;
  let afterParams = false;
  let angleDepth = 0;
  for (let i = 0; i < joined.length; i++) {
    const c = joined[i];
    if (c === '(') pDepth++;
    else if (c === ')') {
      pDepth--;
      if (pDepth === 0) afterParams = true;
    } else if (afterParams) {
      if (c === '<') angleDepth++;
      else if (c === '>') angleDepth = Math.max(0, angleDepth - 1);
      else if (c === '{' && angleDepth === 0) {
        return joined.slice(0, i).trim();
      }
    }
  }
  return joined.replace(/\{[\s\S]*$/, '').trim();
}

/** Extract interface, type, export function, class, and enum signatures from TS/JS source code. */
export function extractSignaturesFromSource(
  source: string,
  options?: Partial<ContextBuildOptions>
): ExtractedSymbol[] {
  const includeTypes = options?.includeTypesAndInterfaces ?? true;
  const includeFns = options?.includeFunctions ?? true;
  const includeClasses = options?.includeClassesAndEnums ?? true;
  const maxLines = options?.maxInterfaceLines ?? 14;

  const clean = stripCommentsPreserveLines(source);
  const lines = clean.split(/\r?\n/);
  const symbols: ExtractedSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // interface / export interface
    if (includeTypes) {
      const ifaceMatch = trimmed.match(/^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/);
      if (ifaceMatch) {
        symbols.push({
          kind: 'interface',
          name: ifaceMatch[1],
          signature: captureBlock(lines, i, maxLines),
          line: i + 1,
        });
        continue;
      }

      // type / export type
      const typeMatch = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/);
      if (typeMatch) {
        let sig = trimmed;
        if (!trimmed.endsWith(';') && trimmed.includes('{')) {
          sig = captureBlock(lines, i, maxLines);
        } else if (!trimmed.endsWith(';')) {
          const collected = [trimmed];
          for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
            const nextTrim = lines[j].trim();
            if (!nextTrim) break;
            collected.push(nextTrim);
            if (nextTrim.endsWith(';')) break;
          }
          sig = collected.join(' ').replace(/\s+/g, ' ');
        }
        symbols.push({
          kind: 'type',
          name: typeMatch[1],
          signature: sig,
          line: i + 1,
        });
        continue;
      }
    }

    // export function / export async function / export default function
    if (includeFns) {
      const fnMatch = trimmed.match(
        /^export\s+(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/
      );
      if (fnMatch) {
        symbols.push({
          kind: 'function',
          name: fnMatch[1],
          signature: captureFunctionHeader(lines, i),
          line: i + 1,
        });
        continue;
      }

      // export const foo = (...) =>
      const arrowMatch = trimmed.match(
        /^export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|<)/
      );
      if (arrowMatch && (trimmed.includes('=>') || (lines[i + 1] && lines[i + 1].includes('=>')))) {
        symbols.push({
          kind: 'function',
          name: arrowMatch[1],
          signature: captureFunctionHeader(lines, i),
          line: i + 1,
        });
        continue;
      }
    }

    // export class / export enum
    if (includeClasses) {
      const classMatch = trimmed.match(
        /^export\s+(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)[^{]*/
      );
      if (classMatch) {
        symbols.push({
          kind: 'class',
          name: classMatch[1],
          signature: classMatch[0].trim(),
          line: i + 1,
        });
        continue;
      }

      const enumMatch = trimmed.match(/^(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/);
      if (enumMatch) {
        symbols.push({
          kind: 'enum',
          name: enumMatch[1],
          signature: captureBlock(lines, i, 10),
          line: i + 1,
        });
      }
    }
  }

  return symbols;
}

/** Generate complete AI-ready Markdown technical summary from scanned source files. */
export function buildRepoContextMarkdown(
  files: ScannedSourceFile[],
  projectName: string,
  ignoredCount: number,
  options: ContextBuildOptions
): ContextBuildResult {
  const treePaths = files
    .filter((f) => isReadableProjectFile(f.path) || files.length < 150)
    .map((f) => f.path);

  const treeText = buildDirectoryTree(treePaths, projectName);

  // Extract package.json stack info if available
  let pkgSection = '';
  if (options.includePackageJson) {
    const pkgFile = files.find((f) => f.path === 'package.json' || f.path.endsWith('/package.json'));
    if (pkgFile && pkgFile.content) {
      try {
        const pkg = JSON.parse(pkgFile.content) as {
          name?: string;
          version?: string;
          scripts?: Record<string, string>;
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
        const deps = Object.keys(pkg.dependencies ?? {});
        const devDeps = Object.keys(pkg.devDependencies ?? {});
        const scripts = Object.entries(pkg.scripts ?? {}).map(([k, v]) => `\`${k}: ${v}\``);
        pkgSection = [
          `## Stack & Dependências (\`${pkgFile.path}\`)`,
          pkg.name ? `- **Pacote:** \`${pkg.name}${pkg.version ? `@${pkg.version}` : ''}\`` : '',
          deps.length ? `- **Dependencies (${deps.length}):** ${deps.map((d) => `\`${d}\``).join(', ')}` : '',
          devDeps.length
            ? `- **DevDependencies (${devDeps.length}):** ${devDeps.map((d) => `\`${d}\``).join(', ')}`
            : '',
          scripts.length ? `- **Scripts:** ${scripts.join(' · ')}` : '',
          '',
        ]
          .filter(Boolean)
          .join('\n');
      } catch {
        // Ignore invalid package.json
      }
    }
  }

  const reports: FileSignatureReport[] = [];
  let codeFileCount = 0;
  let totalSymbols = 0;

  for (const file of files) {
    if (!isCodeFile(file.path) || !file.content) continue;
    codeFileCount++;
    const symbols = extractSignaturesFromSource(file.content, options);
    if (symbols.length > 0) {
      reports.push({ path: file.path, size: file.size, symbols });
      totalSymbols += symbols.length;
    }
  }

  const apiSections = reports
    .map((r) => {
      const blocks = r.symbols.map((s) => `// L${s.line} [${s.kind}]\n${s.signature}`).join('\n\n');
      return `### \`${r.path}\`\n\`\`\`ts\n${blocks}\n\`\`\``;
    })
    .join('\n\n');

  const markdown = [
    `# Contexto Técnico do Repositório: ${projectName}`,
    ``,
    `> Gerado por **ARENA//FORGE Context Builder** · ${files.length} arquivos úteis (${ignoredCount} itens ignorados) · ${totalSymbols} assinaturas extraídas`,
    ``,
    pkgSection,
    `## Árvore de Pastas`,
    '```text',
    treeText,
    '```',
    ``,
    `## Assinaturas de Contratos & Funções Exportadas`,
    apiSections || `_Nenhuma assinatura \`interface\`, \`type\` ou \`export function\` encontrada nos arquivos selecionados._`,
  ]
    .filter((section) => section !== '')
    .join('\n');

  const estimatedTokens = Math.ceil(markdown.length / 4);

  return {
    projectName,
    totalFilesScanned: files.length,
    ignoredCount,
    codeFileCount,
    totalSymbols,
    estimatedTokens,
    treeText,
    reports,
    markdown,
  };
}

/** Realistic sample project files for instant 1-click preview/testing. */
export const DEMO_REPO_FILES: ScannedSourceFile[] = [
  {
    path: 'package.json',
    size: 420,
    content: JSON.stringify(
      {
        name: 'orbital-raider-pwa',
        version: '0.4.2',
        scripts: { dev: 'vite', build: 'tsc && vite build' },
        dependencies: { react: '^19.0.0', 'react-dom': '^19.0.0' },
        devDependencies: { vite: '^7.0.0', typescript: '^5.8.0', 'vite-plugin-pwa': '^1.0.0' },
      },
      null,
      2
    ),
  },
  {
    path: 'src/engine/types.ts',
    size: 510,
    content: `export type EntityFaction = 'player' | 'enemy' | 'neutral';

export interface Vec2 {
  x: number;
  y: number;
}

export interface CombatEntity {
  id: string;
  faction: EntityFaction;
  position: Vec2;
  velocity: Vec2;
  hp: number;
  radius: number;
}
`,
  },
  {
    path: 'src/engine/physics.ts',
    size: 620,
    content: `import type { CombatEntity, Vec2 } from './types';

export function integrateMotion(entity: CombatEntity, dt: number): Vec2 {
  entity.position.x += entity.velocity.x * dt;
  entity.position.y += entity.velocity.y * dt;
  return entity.position;
}

export function checkCircleCollision(a: CombatEntity, b: CombatEntity): boolean {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  const r = a.radius + b.radius;
  return dx * dx + dy * dy <= r * r;
}
`,
  },
  {
    path: 'src/audio/sfxBank.ts',
    size: 380,
    content: `export type SfxId = 'laser' | 'hit' | 'shield' | 'explosion';

export async function unlockAudioEngine(): Promise<boolean> {
  return true;
}

export function triggerProceduralSfx(id: SfxId, volume = 0.7): void {
  void id;
  void volume;
}
`,
  },
  {
    path: 'src/ui/HudOverlay.tsx',
    size: 340,
    content: `export interface HudProps {
  hp: number;
  score: number;
  wave: number;
}

export function HudOverlay({ hp, score, wave }: HudProps) {
  return { hp, score, wave };
}
`,
  },
];
