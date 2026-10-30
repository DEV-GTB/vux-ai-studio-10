// Per-language "basic rules" knowledge base.
//
// The chat models we call (DeepSeek / Gemini / Hugging Face / Cloudflare) are
// hosted third-party models. We cannot fine-tune them from inside this app,
// and we should not pretend otherwise. What we *can* do — and what actually
// moves code quality — is give the model a compact, curated ruleset for the
// language in play, every time it writes code.
//
// This file is that ruleset. Each profile holds:
//   id        stable key
//   label     human name
//   extensions / filenames  used to detect the language from a workspace
//   markers   words in a user request that imply the language
//   rules     the "basic rules" injected into the system prompt
//   commands  best-effort toolchain for that language
//
// Rules are deliberately short and high-yield. A wall of rules dilutes
// attention; a dozen sharp ones do not. Keep each rule independently
// actionable and free of filler.

export const LANGUAGE_PROFILES = [
  {
    id: 'javascript',
    label: 'JavaScript',
    extensions: ['.js', '.mjs', '.cjs'],
    filenames: ['package.json'],
    markers: ['javascript', 'java script', 'js', 'node', 'node.js', 'npm', 'express', 'ecmascript'],
    rules: [
      'Use const by default and let only when reassignment is required. Never use var.',
      'Prefer === and !== over == and !=, and always use strict mode semantics.',
      'Use async/await and try/catch for async work; never leave a promise unhandled.',
      'Use ES modules (import/export) for .mjs and modern bundlers; use require only in CommonJS files.',
      'Validate and sanitise any value that came from user input, a URL, or a file.',
      'Keep functions small and single-purpose; return values instead of mutating shared state.',
      'Use optional chaining and nullish coalescing instead of long truthy checks.',
      'Guard against undefined at the boundary of a module: export a default that callers can rely on.',
    ],
    commands: { run: 'node app.js', test: 'npm test', build: 'npm run build', lint: 'npx eslint .' },
  },
  {
    id: 'typescript',
    label: 'TypeScript',
    extensions: ['.ts', '.mts', '.cts'],
    filenames: ['tsconfig.json'],
    markers: ['typescript', 'ts', 'type-safe', 'interface', 'generics'],
    rules: [
      'Never use `any`. Prefer a precise type, a generic parameter, or `unknown` with narrowing.',
      'Use `interface` for object shapes that may be extended and `type` for unions, tuples, and mapped types.',
      'Always declare parameter and return types on exported functions.',
      'Enable strict mode: no implicit any, no implicit returns, exactOptionalPropertyTypes.',
      'Model discriminated unions with a literal field instead of optional booleans.',
      'Use `readonly` arrays and `as const` for literal data that should not be mutated.',
      'Use type guards (`x is Type`) rather than casting to narrow a union.',
      'Keep types close to the code they describe; do not create a barrel of unrelated types.',
    ],
    commands: { run: 'npx tsx src/index.ts', test: 'npm test', build: 'npx tsc --noEmit', lint: 'npx eslint .' },
  },
  {
    id: 'react',
    label: 'React / JSX',
    extensions: ['.jsx', '.tsx'],
    filenames: ['vite.config.js', 'vite.config.ts', 'next.config.js'],
    markers: ['react', 'jsx', 'component', 'hook', 'usestate', 'useeffect', 'next.js', 'vite'],
    rules: [
      'Components are pure functions: no side effects during render, only in effects or handlers.',
      'Call hooks unconditionally at the top level of a component or custom hook. Never in a loop, condition, or nested function.',
      'Keep the dependency array of useEffect complete; never silence exhaustive-deps without a comment explaining why.',
      'Derive state instead of syncing it with an effect; do not mirror props into state.',
      'Give every list a stable key. Never use the array index as a key for reorderable lists.',
      'Do not mutate props or state. Create new objects and arrays when updating state.',
      'Use functional updates (setX(prev => ...)) when the next value depends on the previous one.',
      'Split components when one exceeds roughly 150 lines or does more than one job.',
      'Mark loading, empty, and error states explicitly in the UI.',
    ],
    commands: { run: 'npm run dev', test: 'npm test', build: 'npm run build', lint: 'npx eslint .' },
  },
  {
    id: 'html',
    label: 'HTML',
    extensions: ['.html', '.htm'],
    filenames: ['index.html'],
    markers: ['html', 'markup', 'dom', 'semantic'],
    rules: [
      'Use semantic elements: header, nav, main, section, article, aside, footer.',
      'Every input needs a label bound with the for attribute.',
      'Give images meaningful alt text; use alt="" only for decorative images.',
      'Set the lang attribute on the html element and the charset in the first 1024 bytes.',
      'Keep the document order logical; do not reorder with CSS to fix layout.',
      'Use data attributes for custom state instead of inventing non-standard attributes.',
    ],
    commands: { test: 'npx html-validate .', lint: 'npx html-validate .' },
  },
  {
    id: 'css',
    label: 'CSS',
    extensions: ['.css'],
    filenames: [],
    markers: ['css', 'stylesheet', 'flexbox', 'grid', 'layout', 'animation', 'responsive'],
    rules: [
      'Prefer flexbox or grid over absolute positioning for layout.',
      'Use custom properties (variables) for repeated values such as colours and spacing.',
      'Never use !important to win a specificity fight; restructure the selector instead.',
      'Include a focus-visible style for interactive elements and never remove the outline.',
      'Use rem for typography and spacing so the layout respects user font settings.',
      'Add a prefers-reduced-motion media query for animation and transition.',
      'Keep specificity low and avoid deep nesting; use a flat, predictable class naming scheme.',
    ],
    commands: { lint: 'npx stylelint "**/*.css"' },
  },
  {
    id: 'python',
    label: 'Python',
    extensions: ['.py', '.pyi'],
    filenames: ['requirements.txt', 'pyproject.toml', 'Pipfile'],
    markers: ['python', 'py', 'pip', 'django', 'flask', 'fastapi', 'pandas', 'numpy'],
    rules: [
      'Type-annotate function parameters and return values for public functions.',
      'Use dataclasses or pydantic models instead of loose dictionaries for structured data.',
      'Use context managers (with) for files, locks, and database connections.',
      'Catch specific exception types; never use a bare except.',
      'Use f-strings for formatting and pathlib rather than string concatenation and os.path.',
      'Prefer list comprehensions and generator expressions for simple transformations.',
      'Make functions pure where possible; return results instead of mutating global state.',
      'Add type hints to module-level constants that are not self-explanatory.',
    ],
    commands: { run: 'python main.py', test: 'python -m pytest', build: 'python -m build', lint: 'ruff check .' },
  },
  {
    id: 'java',
    label: 'Java',
    extensions: ['.java'],
    filenames: ['pom.xml', 'build.gradle'],
    markers: ['java', 'spring', 'spring boot', 'maven', 'gradle', 'jvm'],
    rules: [
      'One public class per file, named to match the file, with a package declaration.',
      'Use final or immutable types for fields that are set once.',
      'Use Optional as a return type to express "may be absent" instead of returning null.',
      'Prefer composition and interfaces over deep inheritance hierarchies.',
      'Close resources with try-with-resources.',
      'Use records for immutable data carriers and enums with a body for behaviour.',
      'Do not catch Exception broadly; catch the specific exception you can handle.',
    ],
    commands: { run: 'mvn -q compile exec:java', test: 'mvn test', build: 'mvn package', lint: 'mvn checkstyle:check' },
  },
  {
    id: 'c',
    label: 'C',
    extensions: ['.c', '.h'],
    filenames: ['Makefile', 'CMakeLists.txt'],
    markers: ['c language', 'c programming', 'gcc', 'clang', 'embedded c', 'ansi c'],
    rules: [
      'Every malloc has a matching free on all paths; check the return of malloc for NULL.',
      'Always check the return value of fread, fwrite, and fclose.',
      'Use size_t for sizes and indexes that come from sizeof; never use int for a length.',
      'Free all allocated memory before returning, including on early error returns.',
      'Do not mix declarations and code when compiling with an older C standard; keep the standard explicit.',
      'Guard headers with include guards or #pragma once.',
      'Avoid undefined behaviour: no signed overflow, no aliasing violations, no uninitialised reads.',
    ],
    commands: { run: 'gcc -Wall -Wextra -o app main.c', test: 'make test', build: 'make', lint: 'clang-tidy' },
  },
  {
    id: 'cpp',
    label: 'C++',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.hh'],
    filenames: ['CMakeLists.txt'],
    markers: ['c++', 'cpp', 'cplusplus', 'cmake', 'stl', 'boost'],
    rules: [
      'Prefer std::vector, std::string, and std::unique_ptr over raw new and delete.',
      'Use const references for read-only parameters to avoid copies.',
      'Mark members const wherever possible, and mark constructors and assignment operators as const-correct.',
      'Use RAII so resources are released even when an exception is thrown.',
      'Prefer std::optional and std::variant to sentinel values and unsafe casts.',
      'Enable and honour move semantics with the rule of five when you own raw resources.',
      'Compile with warnings enabled: -Wall -Wextra -Wpedantic.',
    ],
    commands: { run: 'cmake --build build && ./build/app', test: 'ctest --test-dir build', build: 'cmake --build build', lint: 'clang-tidy' },
  },
  {
    id: 'csharp',
    label: 'C#',
    extensions: ['.cs'],
    filenames: ['.csproj', '.sln'],
    markers: ['c#', 'csharp', 'dotnet', '.net', 'unity', 'asp.net', 'blazor', 'maui'],
    rules: [
      'Target a modern language version and enable nullable reference types in the project file.',
      'Use async/await all the way down; never block on a Task with .Result or .Wait().',
      'Prefer record types for immutable data and classes with constructor injection for services.',
      'Use LINQ for collection transformations, and materialise once with ToList or ToArray.',
      'Dispose IAsyncDisposable and IDisposable resources with await using or using.',
      'Use nameof and string interpolation for messages and log fields.',
      'Follow SOLID: keep classes focused, and depend on abstractions, not concrete types.',
    ],
    commands: { run: 'dotnet run', test: 'dotnet test', build: 'dotnet build', lint: 'dotnet format --verify-no-changes' },
  },
  {
    id: 'go',
    label: 'Go',
    extensions: ['.go'],
    filenames: ['go.mod'],
    markers: ['golang', 'go language', 'go programming'],
    rules: [
      'Handle every returned error; return it up the stack or log it with context.',
      'Use gofmt/goimports formatting and idiomatic naming: short receivers, no stuttering package names.',
      'Pass large structs by pointer and small values by value; prefer slices over arrays for growth.',
      'Use goroutines only with a clear lifetime, and always pair them with a context cancellation.',
      'Prefer channels or sync primitives deliberately; never share a variable between goroutines without synchronisation.',
      'Use errors.Is and errors.As to inspect wrapped errors, and wrap with %w.',
      'Keep exported identifiers documented in the standard Go doc comment style.',
    ],
    commands: { run: 'go run .', test: 'go test ./...', build: 'go build ./...', lint: 'go vet ./...' },
  },
  {
    id: 'rust',
    label: 'Rust',
    extensions: ['.rs'],
    filenames: ['Cargo.toml'],
    markers: ['rust', 'cargo', 'borrow checker', 'rustlang'],
    rules: [
      'Model failure with Result and Option instead of panics; avoid unwrap and expect outside tests.',
      'Follow ownership rules: prefer borrowing (&str, &[T]) over cloning.',
      'Use ? for error propagation and keep error types meaningful with thiserror or anyhow.',
      'Make lifetimes explicit only where they are needed; elide them otherwise.',
      'Use iterators and closures instead of manual index loops where they read better.',
      'Use derive(Debug, Clone, PartialEq) and Default on plain data types.',
      'Keep unsafe blocks minimal, documented, and isolated behind a safe API.',
    ],
    commands: { run: 'cargo run', test: 'cargo test', build: 'cargo build --release', lint: 'cargo clippy -- -D warnings' },
  },
  {
    id: 'ruby',
    label: 'Ruby',
    extensions: ['.rb'],
    filenames: ['Gemfile', 'Rakefile'],
    markers: ['ruby', 'rails', 'sinatra', 'rake'],
    rules: [
      'Use snake_case for methods and variables, and PascalCase for classes and modules.',
      'Prefer plain Ruby objects over heavy metaprogramming; explicit code is easier to review.',
      'Use blocks and Enumerable methods (map, select, reduce) over explicit loops.',
      'Freeze immutable constants and use the frozen string literal comment at the top of files.',
      'Never rescue Exception; rescue the specific error class you can handle.',
      'Use attr_reader instead of writing boilerplate accessors by hand.',
    ],
    commands: { run: 'ruby app.rb', test: 'bundle exec rspec', build: 'bundle install', lint: 'rubocop' },
  },
  {
    id: 'php',
    label: 'PHP',
    extensions: ['.php'],
    filenames: ['composer.json'],
    markers: ['php', 'laravel', 'symfony', 'composer'],
    rules: [
      'Start files with <?php and always use strict_types declare(strict_types=1).',
      'Use PSR-12 formatting and PSR-4 autoloading through Composer.',
      'Escape all output with htmlspecialchars and never concatenate SQL — use prepared statements.',
      'Use type declarations on parameters and return types.',
      'Prefer dependency injection through the constructor over global helpers and static state.',
      'Use null coalescing and nullsafe operators for optional values.',
    ],
    commands: { run: 'php -S localhost:8000', test: 'vendor/bin/phpunit', build: 'composer install', lint: 'php -l file.php' },
  },
  {
    id: 'kotlin',
    label: 'Kotlin',
    extensions: ['.kt', '.kts'],
    filenames: ['build.gradle.kts'],
    markers: ['kotlin', 'android', 'jetpack compose', 'kts'],
    rules: [
      'Prefer val over var, and use immutable collection types by default.',
      'Use data classes for data carriers and sealed classes for closed hierarchies.',
      'Use non-null types by default; declare T? only when absence is real, and handle it.',
      'Use expression functions and scope functions (let, apply, run) where they improve clarity.',
      'Use coroutines with structured concurrency; never launch a GlobalScope coroutine.',
      'Follow official Kotlin code style: 4-space indent, trailing commas, no wildcard imports.',
    ],
    commands: { run: 'gradlew run', test: 'gradlew test', build: 'gradlew build', lint: 'ktlint' },
  },
  {
    id: 'swift',
    label: 'Swift',
    extensions: ['.swift'],
    filenames: ['Package.swift', 'project.pbxproj'],
    markers: ['swift', 'swiftui', 'uikit', 'ios app', 'macos app'],
    rules: [
      'Prefer let over var and make properties private unless they are part of the type contract.',
      'Use optionals deliberately and unwrap them with guard let early-return or if let binding.',
      'Prefer value types (struct, enum) over reference types (class) unless identity is required.',
      'Use SwiftUI state ownership correctly: @State for owned value, @Binding for a child, @Observable for a model.',
      'Handle async work with async/await and make throwing calls explicit with try.',
      'Follow API naming guidelines: lowerCamelCase for functions and variables, UpperCamelCase for types.',
    ],
    commands: { run: 'swift run', test: 'swift test', build: 'swift build', lint: 'swiftlint' },
  },
  {
    id: 'shell',
    label: 'Shell / Bash',
    extensions: ['.sh', '.bash', '.zsh'],
    filenames: [],
    markers: ['shell', 'bash', 'shell script', 'zsh', 'terminal script'],
    rules: [
      'Start every script with #!/usr/bin/env bash and set -euo pipefail.',
      'Quote every variable expansion: use "${var}" not $var.',
      'Use arrays or a while read loop for looping over words; never iterate over a raw string.',
      'Check for the existence of every command and file the script depends on.',
      'Use mktemp for temporary files and a trap to clean them up on exit.',
      'Send diagnostics to stderr and keep stdout clean so the script can be piped.',
    ],
    commands: { test: 'shellcheck .', lint: 'shellcheck .' },
  },
  {
    id: 'sql',
    label: 'SQL',
    extensions: ['.sql'],
    filenames: [],
    markers: ['sql', 'query', 'database', 'select', 'postgres', 'mysql', 'sqlite'],
    rules: [
      'Never build SQL by string concatenation; use parameterised queries or prepared statements.',
      'Select only the columns you need and always qualify column names with the table or alias.',
      'Add an index for every column used in a WHERE, JOIN, or ORDER BY clause on a large table.',
      'Use explicit JOIN types and put the ON condition next to the JOIN it belongs to.',
      'Use transactions for multi-statement writes and always commit or roll back explicitly.',
      'Follow the project naming convention for tables, columns, and keys consistently.',
    ],
    commands: { test: 'psql -c "SELECT 1"', lint: 'sqlfluff lint .' },
  },
  {
    id: 'dart',
    label: 'Dart / Flutter',
    extensions: ['.dart'],
    filenames: ['pubspec.yaml'],
    markers: ['dart', 'flutter', 'pub'],
    rules: [
      'Make every widget immutable: final fields and const constructors where possible.',
      'Never call setState after the widget is disposed; check mounted first.',
      'Use StatelessWidget unless local mutable state is genuinely required.',
      'Prefer value equality with Equatable or a freezed union over manual == overrides.',
      'Manage asynchronous state with FutureBuilder, StreamBuilder, or a state management package — not setState in a Future.then.',
      'Use const constructors to keep rebuilds cheap.',
    ],
    commands: { run: 'flutter run', test: 'flutter test', build: 'flutter build', lint: 'flutter analyze' },
  },
  {
    id: 'lua',
    label: 'Lua',
    extensions: ['.lua'],
    filenames: [],
    markers: ['lua', 'lÖve', 'love2d', 'neovim lua'],
    rules: [
      'Use local for every variable that does not need to be global; global is the default scope.',
      'Use snake_case for variables and functions, and UpperCamelCase for modules.',
      'Prefer tables with explicit string keys over array-style access when the data is a record.',
      'Check for nil before indexing a table returned by another function.',
      'Use pcall for calls that may fail when you need to recover from the error.',
    ],
    commands: { test: 'busted', lint: 'luacheck .' },
  },
  {
    id: 'elixir',
    label: 'Elixir',
    extensions: ['.ex', '.exs'],
    filenames: ['mix.exs'],
    markers: ['elixir', 'phoenix', 'mix', 'otp'],
    rules: [
      'Use the pipe operator to chain transformations instead of long intermediate variables.',
      'Pattern match in function heads and with clauses instead of defensive if/else chains.',
      'Use immutable data and let the process own the state; never mutate a struct in place.',
      'Return {:ok, value} and {:error, reason} tuples from fallible operations.',
      'Use GenServer for stateful processes and supervision trees for lifetime.',
    ],
    commands: { run: 'mix phx.server', test: 'mix test', build: 'mix compile', lint: 'mix credo' },
  },
  {
    id: 'json',
    label: 'JSON',
    extensions: ['.json', '.jsonc'],
    filenames: ['package-lock.json', 'tsconfig.json'],
    markers: ['json', 'manifest', 'package json'],
    rules: [
      'Use double quotes for keys and strings, and two-space indentation.',
      'Keep one top-level object or array per file.',
      'Do not add trailing commas and do not add comments to strict JSON files.',
      'Keep key order stable and meaningful so diffs stay readable.',
    ],
    commands: { lint: 'npx prettier --check "**/*.json"' },
  },
  {
    id: 'yaml',
    label: 'YAML',
    extensions: ['.yml', '.yaml'],
    filenames: ['docker-compose.yml', 'docker-compose.yaml'],
    markers: ['yaml', 'yml', 'workflow file', 'pipeline config'],
    rules: [
      'Use two-space indentation and never mix tabs with spaces.',
      'Quote strings that could be read as another type: yes, no, on, off, 1.0, null.',
      'Use anchors for values that are genuinely repeated, not for readability.',
      'Keep list items aligned with the key that owns them.',
      'Validate the file with a parser before committing it.',
    ],
    commands: { lint: 'yamllint .' },
  },
  {
    id: 'docker',
    label: 'Docker',
    extensions: ['.dockerfile'],
    filenames: ['Dockerfile', 'docker-compose.yml'],
    markers: ['docker', 'container', 'dockerfile', 'compose'],
    rules: [
      'Use a specific versioned base image, not latest.',
      'Copy the dependency manifest first and install dependencies in their own layer for build caching.',
      'Run the app as a non-root user.',
      'Use a .dockerignore so node_modules, .git, and build output stay out of the build context.',
      'Keep one concern per layer and order layers from least to most frequently changing.',
      'Use exec form for ENTRYPOINT and CMD so signals reach the process.',
    ],
    commands: { build: 'docker build -t app .', test: 'docker run --rm app' },
  },
];

const PROFILE_BY_ID = new Map(LANGUAGE_PROFILES.map((profile) => [profile.id, profile]));

const EXTENSION_OWNERS = new Map();
for (const profile of LANGUAGE_PROFILES) {
  for (const extension of profile.extensions) {
    // First profile wins, so .jsx maps to react rather than javascript.
    if (!EXTENSION_OWNERS.has(extension)) EXTENSION_OWNERS.set(extension, profile.id);
  }
}

const FILENAME_OWNERS = new Map();
for (const profile of LANGUAGE_PROFILES) {
  for (const filename of profile.filenames) {
    if (!FILENAME_OWNERS.has(filename)) FILENAME_OWNERS.set(filename, profile.id);
  }
}

export function getLanguageProfile(id) {
  return PROFILE_BY_ID.get(id) || null;
}

export function languageProfileForFile(fileName = '') {
  const value = String(fileName || '').toLowerCase();
  if (!value) return null;

  const baseName = value.split('/').pop();
  if (FILENAME_OWNERS.has(baseName)) return PROFILE_BY_ID.get(FILENAME_OWNERS.get(baseName));

  // Dockerfile variants: "Dockerfile", "Dockerfile.dev", "app.dockerfile"
  if (baseName === 'dockerfile' || baseName.endsWith('.dockerfile') || baseName.startsWith('dockerfile.')) {
    return PROFILE_BY_ID.get('docker');
  }

  const dotIndex = value.lastIndexOf('.');
  if (dotIndex === -1) return null;
  const extension = value.slice(dotIndex);
  const owner = EXTENSION_OWNERS.get(extension);
  return owner ? PROFILE_BY_ID.get(owner) : null;
}

// Turns a file list into a stack description: which languages are present and
// how dominant each one is. Used to decide which rulesets to inject.
export function detectWorkspaceStack(fileNames = []) {
  const counts = new Map();
  for (const fileName of fileNames) {
    const profile = languageProfileForFile(fileName);
    if (!profile) continue;
    counts.set(profile.id, (counts.get(profile.id) || 0) + 1);
  }

  const languages = [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([id, count]) => ({ profile: PROFILE_BY_ID.get(id), count }));

  const framework = detectFramework(fileNames);
  return { languages, framework };
}

function detectFramework(fileNames = []) {
  const names = new Set(fileNames.map((name) => String(name).toLowerCase()));
  if (names.has('next.config.js') || names.has('next.config.ts') || names.has('next.config.mjs')) return 'Next.js';
  if (names.has('vite.config.js') || names.has('vite.config.ts')) return 'Vite';
  if (names.has('manage.py')) return 'Django';
  if (names.has('pubspec.yaml')) return 'Flutter';
  if (names.has('mix.exs')) return 'Phoenix';
  if (names.has('build.gradle') || names.has('build.gradle.kts')) return 'Gradle';
  if (names.has('pom.xml')) return 'Maven';
  if (names.has('cargo.toml')) return 'Cargo';
  if (names.has('go.mod')) return 'Go modules';
  if (names.has('package.json')) return 'Node.js';
  if (names.has('requirements.txt') || names.has('pyproject.toml')) return 'Python';
  return null;
}

// Detects a language mentioned in the user's own words. Markers are matched on
// word boundaries so "go" does not fire on "google" and "c" does not fire on
// "css".
export function detectLanguagesFromText(text = '') {
  const value = String(text || '').toLowerCase();
  if (!value.trim()) return [];

  const hits = [];
  for (const profile of LANGUAGE_PROFILES) {
    let score = 0;
    for (const marker of profile.markers) {
      const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`(^|[^a-z0-9+#])${escaped}([^a-z0-9+#]|$)`, 'i').test(value)) score += 1;
    }
    if (score > 0) hits.push({ profile, score });
  }

  return hits
    .sort((left, right) => right.score - left.score || left.profile.id.localeCompare(right.profile.id))
    .map((hit) => hit.profile);
}

// The rule block injected into the system prompt for a given set of languages.
// Rules are deduplicated so overlapping profiles do not repeat themselves.
export function buildLanguageRules(languageIds = [], { limit = 3 } = {}) {
  const seen = new Set();
  const blocks = [];

  for (const id of languageIds) {
    const profile = PROFILE_BY_ID.get(id);
    if (!profile) continue;

    const rules = profile.rules.filter((rule) => {
      if (seen.has(rule)) return false;
      seen.add(rule);
      return true;
    });
    if (!rules.length) continue;

    blocks.push(`${profile.label}:\n${rules.map((rule) => `- ${rule}`).join('\n')}`);
    if (blocks.length >= limit) break;
  }

  return blocks.join('\n\n');
}

export function listLanguageIds() {
  return LANGUAGE_PROFILES.map((profile) => profile.id);
}
