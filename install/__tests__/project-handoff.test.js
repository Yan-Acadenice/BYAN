'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  FORMAT,
  buildHandoff,
  defaultHandoffPath,
  handoffDir,
  latestHandoff,
  parseMarkdown,
  providerMatches,
  renderMarkdown,
  renderResumePrompt,
  writeHandoff,
} = require('../lib/project-handoff');

function tmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'byan-handoff-'));
}

describe('project-handoff', () => {
  test('renders Markdown with parseable machine block and human sections', () => {
    const handoff = buildHandoff({
      root: '/repo',
      project: 'BYAN',
      from: 'claude',
      to: 'codex',
      task: 'finish installer',
      summary: 'RTK handoff',
      decisions: ['Codex gets binary, Claude gets hook'],
      filesTouched: ['install/lib/rtk-integration.js'],
      commands: ['npm test -- --runTestsByPath install/__tests__/rtk-integration.test.js'],
      nextActions: ['Run strict complete'],
      git: { branch: 'main', head: 'abc1234', status: ' M file', changedFiles: ['file'] },
      fd: { fd_id: 'FD-1', feature_name: 'handoff', phase: 'BUILD', strict_mode: true, backlog: [] },
      createdAt: '2026-07-03T20:00:00.000Z',
    });

    const md = renderMarkdown(handoff);
    expect(md).toContain('```json byan-handoff');
    expect(md).toContain('## Resume Prompt');
    expect(md).toContain('## Next Actions');
    const parsed = parseMarkdown(md);
    expect(parsed).toMatchObject({
      format: FORMAT,
      version: '1.0',
      project: 'BYAN',
      from: 'claude',
      to: 'codex',
      currentTask: 'finish installer',
    });
    expect(parsed.decisions).toEqual(['Codex gets binary, Claude gets hook']);
  });

  test('resume prompt is compact and names the source of truth rule', () => {
    const prompt = renderResumePrompt({
      project: 'BYAN',
      from: 'codex',
      to: 'claude',
      currentTask: 'continue FD',
      summary: 'Implementation done, validation pending',
      filesTouched: ['install/bin/byan-handoff.js'],
      nextActions: ['Run tests'],
      git: { changedFiles: [] },
      fd: { feature_name: 'claude-codex-md-handoff', phase: 'VALIDATE' },
    });
    expect(prompt).toContain('created by codex for claude');
    expect(prompt).toContain('Files to inspect first: install/bin/byan-handoff.js');
    expect(prompt).toContain('FD state: claude-codex-md-handoff is in phase VALIDATE');
    expect(prompt).toContain('BYAN portable state as source of truth');
  });

  test('writeHandoff stores under _byan-output/handoffs and latest returns newest file', () => {
    const root = tmpRoot();
    const first = writeHandoff(root, {
      from: 'claude',
      to: 'codex',
      currentTask: 'first',
      git: { changedFiles: [] },
      fd: null,
      createdAt: '2026-07-03T20:00:00.000Z',
    }, { outPath: path.join(handoffDir(root), '20260703T200000Z-claude-to-codex-first.md') });
    const second = writeHandoff(root, {
      from: 'codex',
      to: 'claude',
      currentTask: 'second',
      git: { changedFiles: [] },
      fd: null,
      createdAt: '2026-07-03T20:01:00.000Z',
    }, { outPath: path.join(handoffDir(root), '20260703T200100Z-codex-to-claude-second.md') });

    expect(fs.existsSync(first.path)).toBe(true);
    expect(latestHandoff(root)).toBe(second.path);
  });

  test('latestHandoff can filter by source provider', () => {
    const root = tmpRoot();
    const claude = writeHandoff(root, {
      from: 'claude',
      to: 'codex',
      currentTask: 'claude handoff',
      git: { changedFiles: [] },
      fd: null,
    }, { outPath: path.join(handoffDir(root), '20260703T200000Z-claude-to-codex.md') });
    writeHandoff(root, {
      from: 'codex',
      to: 'claude',
      currentTask: 'codex handoff',
      git: { changedFiles: [] },
      fd: null,
    }, { outPath: path.join(handoffDir(root), '20260703T200100Z-codex-to-claude.md') });

    expect(latestHandoff(root, { from: 'claude' })).toBe(claude.path);
    expect(latestHandoff(root, { from: 'missing' })).toBeNull();
  });

  test('provider match accepts platform aliases such as claude-code', () => {
    expect(providerMatches('claude-code', 'claude')).toBe(true);
    expect(providerMatches('codex', 'codex')).toBe(true);
    expect(providerMatches('claude', 'codex')).toBe(false);
  });

  test('default path encodes timestamp, source, target, and task', () => {
    const p = defaultHandoffPath('/repo', {
      from: 'Claude Code',
      to: 'Codex',
      currentTask: 'Switch Limits',
    }, new Date('2026-07-03T20:01:02.000Z'));
    expect(p).toBe('/repo/_byan-output/handoffs/20260703T200102Z-claude-code-to-codex-switch-limits.md');
  });
});

describe('byan-handoff CLI', () => {
  test('export --stdout and import --prompt round trip', () => {
    const root = tmpRoot();
    const bin = path.join(__dirname, '..', 'bin', 'byan-handoff.js');
    const md = execFileSync('node', [
      bin,
      'export',
      '--root', root,
      '--from', 'claude',
      '--to', 'codex',
      '--task', 'portable exchange',
      '--summary', 'Need to switch assistant',
      '--next', 'Inspect handoff',
      '--stdout',
    ], { encoding: 'utf8' });
    const file = path.join(root, 'handoff.md');
    fs.writeFileSync(file, md);

    const prompt = execFileSync('node', [bin, 'import', file, '--prompt', '--root', root], { encoding: 'utf8' });
    expect(prompt).toContain('created by claude for codex');
    expect(prompt).toContain('Task: portable exchange');
    expect(prompt).toContain('Next actions: Inspect handoff');
  });

  test('latest --from imports the newest handoff from the requested provider', () => {
    const root = tmpRoot();
    const bin = path.join(__dirname, '..', 'bin', 'byan-handoff.js');
    execFileSync('node', [
      bin,
      'export',
      '--root', root,
      '--from', 'claude',
      '--to', 'codex',
      '--task', 'from claude',
      '--out', path.join(handoffDir(root), '20260703T200000Z-claude-to-codex.md'),
    ], { encoding: 'utf8' });
    execFileSync('node', [
      bin,
      'export',
      '--root', root,
      '--from', 'codex',
      '--to', 'claude',
      '--task', 'from codex',
      '--out', path.join(handoffDir(root), '20260703T200100Z-codex-to-claude.md'),
    ], { encoding: 'utf8' });

    const prompt = execFileSync('node', [bin, 'latest', '--from', 'claude', '--prompt', '--root', root], { encoding: 'utf8' });
    expect(prompt).toContain('created by claude for codex');
    expect(prompt).toContain('Task: from claude');
  });
});
