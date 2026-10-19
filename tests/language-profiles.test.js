import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LANGUAGE_PROFILES,
  getLanguageProfile,
  languageProfileForFile,
  detectWorkspaceStack,
  detectLanguagesFromText,
  buildLanguageRules,
  listLanguageIds,
} from '../lib/languageProfiles.js';

test('every language profile has the fields the prompt builder needs', () => {
  for (const profile of LANGUAGE_PROFILES) {
    assert.ok(profile.id, 'profile needs an id');
    assert.ok(profile.label, `${profile.id} needs a label`);
    assert.ok(Array.isArray(profile.extensions) && profile.extensions.length, `${profile.id} needs extensions`);
    assert.ok(Array.isArray(profile.rules) && profile.rules.length >= 4, `${profile.id} needs at least four rules`);
    for (const rule of profile.rules) {
      assert.equal(typeof rule, 'string');
      assert.ok(rule.trim().length > 10, `${profile.id} has an empty rule`);
    }
  }
});

test('the ruleset covers the languages a studio user is likely to open', () => {
  const expected = [
    'javascript', 'typescript', 'react', 'html', 'css', 'python', 'java',
    'c', 'cpp', 'csharp', 'go', 'rust', 'ruby', 'php', 'kotlin', 'swift',
    'shell', 'sql', 'dart', 'json', 'yaml', 'docker',
  ];
  for (const id of expected) {
    assert.ok(getLanguageProfile(id), `missing profile for ${id}`);
  }
});

test('language ids are unique', () => {
  const ids = listLanguageIds();
  assert.equal(new Set(ids).size, ids.length);
});

test('file extensions map to the right language', () => {
  const cases = {
    'app.js': 'javascript',
    'app.mjs': 'javascript',
    'app.ts': 'typescript',
    'Component.jsx': 'react',
    'index.html': 'html',
    'styles.css': 'css',
    'main.py': 'python',
    'Main.java': 'java',
    'lib.c': 'c',
    'lib.h': 'c',
    'lib.cpp': 'cpp',
    'lib.hpp': 'cpp',
    'Service.cs': 'csharp',
    'main.go': 'go',
    'lib.rs': 'rust',
    'app.rb': 'ruby',
    'index.php': 'php',
    'Main.kt': 'kotlin',
    'App.swift': 'swift',
    'deploy.sh': 'shell',
    'query.sql': 'sql',
    'main.dart': 'dart',
    'config.json': 'json',
    'config.yml': 'yaml',
    'Dockerfile': 'docker',
  };

  for (const [fileName, expected] of Object.entries(cases)) {
    const profile = languageProfileForFile(fileName);
    assert.equal(profile?.id, expected, `${fileName} should map to ${expected}`);
  }
});

test('nested workspace paths are detected by extension', () => {
  assert.equal(languageProfileForFile('src/components/Button.tsx')?.id, 'react');
  assert.equal(languageProfileForFile('src/services/api.py')?.id, 'python');
  assert.equal(languageProfileForFile('src/lib/util.rs')?.id, 'rust');
});

test('unknown files return no profile instead of guessing', () => {
  assert.equal(languageProfileForFile('data.bin'), null);
  assert.equal(languageProfileForFile('README'), null);
  assert.equal(languageProfileForFile(''), null);
});

test('the workspace stack ranks languages by how many files use them', () => {
  const stack = detectWorkspaceStack([
    'index.html',
    'styles.css',
    'app.js',
    'app.js',
    'utils.js',
    'server.py',
  ]);

  assert.equal(stack.languages[0].profile.id, 'javascript');
  assert.equal(stack.languages[0].count, 3);
  assert.ok(stack.languages.some((entry) => entry.profile.id === 'python'));
});

test('the framework is detected from the project layout', () => {
  assert.equal(detectWorkspaceStack(['package.json']).framework, 'Node.js');
  assert.equal(detectWorkspaceStack(['vite.config.ts', 'package.json']).framework, 'Vite');
  assert.equal(detectWorkspaceStack(['Cargo.toml']).framework, 'Cargo');
  assert.equal(detectWorkspaceStack(['go.mod']).framework, 'Go modules');
  assert.equal(detectWorkspaceStack(['pyproject.toml']).framework, 'Python');
  assert.equal(detectWorkspaceStack(['index.html']).framework, null);
});

test('a language named in the request is detected', () => {
  const ids = detectLanguagesFromText('Rewrite this function in Rust').map((profile) => profile.id);
  assert.ok(ids.includes('rust'));
});

test('short language words do not match inside longer words', () => {
  const ids = detectLanguagesFromText('Google cloud runs our containers').map((profile) => profile.id);
  assert.ok(!ids.includes('go'), '"google" must not trigger Go');
  assert.ok(!ids.includes('c'), '"cloud" must not trigger C');
});

test('the language rules block is deduplicated and capped', () => {
  const rules = buildLanguageRules(['javascript', 'typescript']);
  assert.match(rules, /JavaScript:/);
  assert.match(rules, /TypeScript:/);

  const capped = buildLanguageRules(['javascript', 'python', 'java', 'go', 'rust'], { limit: 2 });
  const sections = capped.split('\n\n');
  assert.ok(sections.length <= 2, 'the rules block must respect the limit');
});

test('the rules block is empty for unknown languages', () => {
  assert.equal(buildLanguageRules(['not-a-language']), '');
  assert.equal(buildLanguageRules([]), '');
});

test('language rules mention the highest-value conventions for that language', () => {
  const rust = buildLanguageRules(['rust']);
  assert.match(rust, /Result/);
  assert.match(rust, /unwrap/);

  const python = buildLanguageRules(['python']);
  assert.match(python, /annotate/i);

  const react = buildLanguageRules(['react']);
  assert.match(react, /hooks?/i);
});
