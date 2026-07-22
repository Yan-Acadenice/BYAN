// local-data (N1) — the LOCAL-mode data source reads disk, needs no token.
// Uses BYAN_HOME for a temp registry + a temp project _byan/ tree.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  localMe, localProjects, localProject, localAgents, localKnowledge, localMemory, localSessions,
} from '../local-data';

let home: string;
let proj: string;
const origHome = process.env.BYAN_HOME;

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-ld-home-'));
  proj = fs.mkdtempSync(path.join(os.tmpdir(), 'byan-ld-proj-'));
  process.env.BYAN_HOME = home;
  // Registry entry pointing at the temp project (id == path).
  fs.mkdirSync(path.join(home, '.byan'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.byan', 'projects.json'),
    JSON.stringify({ projects: [{ name: 'MonProjet', path: proj, updatedAt: '2026-07-22T00:00:00.000Z' }] }),
    'utf8'
  );
  // A minimal _byan/ tree.
  fs.mkdirSync(path.join(proj, '_byan', 'agent', 'dev'), { recursive: true });
  fs.writeFileSync(path.join(proj, '_byan', 'agent', 'dev', 'soul.md'), '# soul', 'utf8');
  fs.mkdirSync(path.join(proj, '_byan', 'connaissance'), { recursive: true });
  fs.writeFileSync(path.join(proj, '_byan', 'connaissance', 'guide.md'), 'contenu du guide', 'utf8');
  fs.mkdirSync(path.join(proj, '_byan', 'memoire', 'chat-sessions'), { recursive: true });
  fs.writeFileSync(
    path.join(proj, '_byan', 'memoire', 'chat-sessions', 'chat-a.json'),
    JSON.stringify({ id: 'chat-a', created: '2026-07-22T01:00:00.000Z', updated: '2026-07-22T02:00:00.000Z', agent: 'dev', messages: [{ role: 'assistant', content: 'reponse finale' }] }),
    'utf8'
  );
});

afterEach(() => {
  if (origHome === undefined) delete process.env.BYAN_HOME;
  else process.env.BYAN_HOME = origHome;
  for (const d of [home, proj]) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ } }
});

describe('local-data — no token, reads disk', () => {
  it('localMe returns a local pseudo-user', () => {
    expect(localMe()).toMatchObject({ id: 'local', role: 'owner' });
  });

  it('localProjects maps the registry (id == absolute path)', () => {
    const ps = localProjects();
    expect(ps).toHaveLength(1);
    expect(ps[0]).toMatchObject({ id: proj, name: 'MonProjet', type: 'local', my_role: 'owner' });
    expect(localProject(proj)?.name).toBe('MonProjet');
  });

  it('localAgents lists agent directories under _byan/agent', () => {
    const a = localAgents(proj);
    expect(a.map((x) => x.slug)).toContain('dev');
    expect(a.find((x) => x.slug === 'dev')?.soul).toContain('soul');
  });

  it('localKnowledge reads markdown under _byan/connaissance', () => {
    const k = localKnowledge({ projectId: proj });
    expect(k.map((x) => x.title)).toContain('guide');
    expect(k[0].content).toContain('guide');
  });

  it('localSessions + localMemory read the chat-sessions store', () => {
    const s = localSessions({ projectId: proj });
    expect(s.map((x) => x.id)).toContain('chat-a');
    expect(s[0]).toMatchObject({ agent_slug: 'dev', status: 'local' });
    const m = localMemory({ projectId: proj });
    expect(m[0].content).toContain('reponse finale');
  });

  it('degrades to [] when the registry is empty (no throw)', () => {
    fs.writeFileSync(path.join(home, '.byan', 'projects.json'), JSON.stringify({ projects: [] }), 'utf8');
    expect(localProjects()).toEqual([]);
    expect(localAgents()).toEqual([]);
    expect(localKnowledge()).toEqual([]);
    expect(localSessions()).toEqual([]);
  });
});
