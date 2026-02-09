# YANSTALLER - Plan de Développement v1.0

**Scope**: FULL v1 (4 plateformes, 8 capabilities, multi-OS)  
**Timeline**: 5-6 semaines (200-240h)  
**Team**: Yan + 1 dev (2 personnes)  
**Methodology**: Merise Agile + TDD + 64 Mantras

---

## Table des Matières

- [Vue d'Ensemble](#vue-densemble)
- [Architecture Technique](#architecture-technique)
- [Phases de Développement](#phases-de-développement)
- [Tasks Breakdown](#tasks-breakdown)
- [Timeline Détaillée](#timeline-détaillée)
- [Dépendances](#dépendances)
- [Risques & Mitigation](#risques--mitigation)
- [Critères d'Acceptation](#critères-dacceptation)
- [Définition of Done](#définition-of-done)

---

## Vue d'Ensemble

### Objectifs v1.0

**Must Have (Bloquants)**:
- ✅ Détection automatique OS + Node.js + plateformes
- ✅ Installation 3 modes (Full/Minimal/Custom)
- ✅ Validation automatique post-install
- ✅ Support 4 plateformes (Copilot CLI, VSCode, Claude, Codex)
- ✅ Multi-OS (Windows, Linux, macOS)
- ✅ Troubleshooting automatique
- ✅ Backup/Rollback

**Should Have (Importants)**:
- Recommandations intelligentes (analyse projet)
- Post-install wizard
- Guide quick interview

**Could Have (Nice-to-have)**:
- Analytics opt-in
- Update notifications
- Template customization

**Won't Have (v2)**:
- GUI installer
- Cloud sync agents
- Plugin system

---

## Architecture Technique

### Stack

```yaml
Runtime: Node.js >= 18.0.0
Language: JavaScript (ES6+)
Package Manager: npm
Distribution: npm package (create-byan-agent)

Dependencies:
  - inquirer: ^9.2.0 (CLI menus)
  - fs-extra: ^11.2.0 (file operations)
  - chalk: ^5.3.0 (terminal colors)
  - ora: ^7.0.0 (spinners)
  - js-yaml: ^4.1.0 (YAML parsing)
  - commander: ^11.1.0 (CLI arguments)

DevDependencies:
  - jest: ^29.7.0 (unit tests)
  - @types/node: ^20.10.0 (TypeScript types)
  - eslint: ^8.55.0 (linting)
  - prettier: ^3.1.0 (formatting)
```

### Structure Modules

```
install/
├── bin/
│   └── create-byan-agent.js (entry point actuel)
├── lib/
│   ├── yanstaller/
│   │   ├── index.js (main orchestrator)
│   │   ├── detector.js (DETECT-ENVIRONMENT)
│   │   ├── recommender.js (RECOMMEND-CONFIG)
│   │   ├── installer.js (INSTALL-AGENTS)
│   │   ├── validator.js (VALIDATE-INSTALLATION)
│   │   ├── troubleshooter.js (TROUBLESHOOT-ISSUES)
│   │   ├── interviewer.js (GUIDE-QUICK-INTERVIEW)
│   │   ├── backuper.js (BACKUP-RESTORE)
│   │   └── wizard.js (POST-INSTALL-WIZARD)
│   ├── platforms/
│   │   ├── copilot-cli.js
│   │   ├── vscode.js
│   │   ├── claude-code.js
│   │   └── codex.js
│   └── utils/
│       ├── logger.js
│       ├── file-ops.js
│       ├── yaml-validator.js
│       └── os-detector.js
├── templates/ (agents .md files)
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── package.json
└── README.md
```

---

## Phases de Développement

### Phase 0: Setup (Semaine 1, Jours 1-2) - 16h

**Objectif**: Environnement de développement prêt

**Tasks**:
- [ ] Créer structure modules (`lib/yanstaller/`)
- [ ] Setup Jest (tests unitaires)
- [ ] Setup ESLint + Prettier
- [ ] Git workflow (feature branches)
- [ ] CI/CD skeleton (GitHub Actions)
- [ ] Documentation structure

**Livrables**:
- ✅ Repo structuré
- ✅ Tests peuvent s'exécuter (`npm test`)
- ✅ Lint + format automatiques
- ✅ CI pipeline basique

**Critères d'acceptation**:
```bash
npm install  # success
npm test     # 0 tests, but framework working
npm run lint # passes
```

---

### Phase 1: Core Detection (Semaine 1-2, Jours 3-7) - 40h

**Objectif**: Détection environnement fonctionnelle (DETECT-ENVIRONMENT)

#### Task 1.1: OS Detection (8h)
**Fichier**: `lib/utils/os-detector.js`

**Fonctionnalités**:
- Détecte OS (Windows/Linux/macOS)
- Détecte version OS
- Détecte architecture (x64/arm64)
- Paths spécifiques OS (home, config, extensions)

**Tests**:
```javascript
// tests/unit/os-detector.test.js
describe('OSDetector', () => {
  it('should detect Windows 10/11', () => {
    const os = detector.detect();
    expect(os.type).toBe('Windows');
    expect(os.version).toMatch(/^10\.|^11\./);
  });
  
  it('should detect Linux distro', () => {
    const os = detector.detect();
    expect(os.type).toBe('Linux');
    expect(os.distro).toBeOneOf(['Ubuntu', 'Debian', 'Fedora']);
  });
});
```

**Critères acceptation**:
- ✅ Détecte 3 OS (Windows, Linux, macOS)
- ✅ Tests unitaires 100% pass
- ✅ Pas de crash sur OS non reconnu

---

#### Task 1.2: Node.js Detection (4h)
**Fichier**: `lib/yanstaller/detector.js`

**Fonctionnalités**:
- Détecte Node.js version
- Valide >= 18.0.0 (RG-YAN-001)
- Suggère upgrade si < 18

**Tests**:
```javascript
it('should validate Node.js version', () => {
  const result = detector.validateNodeVersion();
  expect(result.valid).toBe(true);
  expect(result.version).toMatch(/^(18|19|20)\./);
});

it('should reject Node.js < 18', () => {
  // Mock process.version = 'v16.20.0'
  const result = detector.validateNodeVersion();
  expect(result.valid).toBe(false);
  expect(result.error).toContain('Node.js >= 18 required');
});
```

**Critères acceptation**:
- ✅ Détecte version exacte
- ✅ Bloque si < 18 (erreur claire)
- ✅ Suggère upgrade (nvm, apt, brew)

---

#### Task 1.3: Git Detection (4h)
**Fichier**: `lib/yanstaller/detector.js`

**Fonctionnalités**:
- Détecte si Git installé
- Warning si absent (pas bloquant, RG-YAN-002)
- Détecte version Git

**Tests**:
```javascript
it('should detect Git presence', () => {
  const result = detector.detectGit();
  expect(result.present).toBe(true);
  expect(result.version).toMatch(/^\d+\.\d+\.\d+/);
});

it('should warn if Git missing', () => {
  // Mock: Git not in PATH
  const result = detector.detectGit();
  expect(result.present).toBe(false);
  expect(result.warning).toContain('Git recommended');
});
```

---

#### Task 1.4: Platform Detection (16h)
**Fichiers**: `lib/platforms/*.js`

**Fonctionnalités**:
- **Copilot CLI**: Détecte commande `gh copilot`
- **VSCode**: Détecte extensions directory
- **Claude Code**: Détecte `claude_desktop_config.json`
- **Codex**: Détecte commande `codex`

**Tests par plateforme**:
```javascript
// tests/unit/platforms/copilot-cli.test.js
describe('CopilotCLI Platform', () => {
  it('should detect gh copilot command', async () => {
    const platform = new CopilotCLI();
    const detected = await platform.detect();
    expect(detected).toBe(true);
  });
  
  it('should return config path', () => {
    const platform = new CopilotCLI();
    expect(platform.getConfigPath()).toBe('.github/agents/');
  });
});
```

**Critères acceptation**:
- ✅ 4 plateformes détectées
- ✅ Tests unitaires par plateforme
- ✅ Handle cas: 0 plateforme, 2+ plateformes
- ✅ Pas de crash si commande inexistante

---

#### Task 1.5: Rapport Détection (8h)
**Fichier**: `lib/yanstaller/detector.js`

**Fonctionnalités**:
- Agrège toutes détections
- Format JSON structuré
- Messages utilisateur formatés (chalk)
- Spinners pendant détection (ora)

**Output attendu**:
```javascript
{
  os: {
    type: 'Linux',
    distro: 'Ubuntu',
    version: '22.04'
  },
  node: {
    version: '20.11.0',
    valid: true
  },
  git: {
    present: true,
    version: '2.43.0'
  },
  platforms: [
    { name: 'copilot-cli', detected: true, version: '1.234.5' },
    { name: 'vscode', detected: true, version: null },
    { name: 'claude-code', detected: false },
    { name: 'codex', detected: false }
  ]
}
```

**Critères acceptation**:
- ✅ Détection < 5 sec
- ✅ Rapport JSON complet
- ✅ Messages CLI formatés (colors, icons)
- ✅ Pas de hang si plateforme lente

---

### Phase 2: Recommandation (Semaine 2, Jours 8-10) - 24h

**Objectif**: Recommandation intelligente agents (RECOMMEND-CONFIG)

#### Task 2.1: Analyse Projet (12h)
**Fichier**: `lib/yanstaller/recommender.js`

**Fonctionnalités**:
- Détecte type projet (frontend/backend/fullstack)
- Scanne `package.json` (dependencies)
- Détecte frameworks (React, Express, Next.js, etc.)
- Détecte databases (MongoDB, PostgreSQL, etc.)

**Logique**:
```javascript
function analyzeProject() {
  const pkg = readPackageJson();
  
  // Frontend detection
  if (pkg.dependencies['react'] || pkg.dependencies['vue']) {
    return { type: 'frontend', frameworks: [...] };
  }
  
  // Backend detection
  if (pkg.dependencies['express'] || pkg.dependencies['fastify']) {
    return { type: 'backend', frameworks: [...] };
  }
  
  // Fullstack
  if (hasFrontend && hasBackend) {
    return { type: 'fullstack', frameworks: [...] };
  }
}
```

**Tests**:
```javascript
it('should detect backend API project', () => {
  const project = recommender.analyzeProject('./test-fixtures/backend-api');
  expect(project.type).toBe('backend');
  expect(project.frameworks).toContain('express');
});
```

---

#### Task 2.2: Recommandation Agents (12h)
**Fichier**: `lib/yanstaller/recommender.js`

**Logique de recommandation**:

```javascript
const RECOMMENDATIONS = {
  frontend: ['BYAN', 'UX-DESIGNER', 'DEV', 'QUINN'],
  backend: ['BYAN', 'ARCHITECT', 'DEV', 'QUINN'],
  fullstack: ['BYAN', 'ARCHITECT', 'DEV', 'UX-DESIGNER', 'QUINN'],
  default: ['BYAN', 'RACHID', 'MARC', 'PATNOTE', 'CARMACK']
};

function recommend(projectType, platforms) {
  const agents = RECOMMENDATIONS[projectType] || RECOMMENDATIONS.default;
  
  // Add platform-specific
  if (platforms.includes('copilot-cli')) {
    agents.push('MARC');
  }
  
  return {
    agents,
    rationale: generateRationale(projectType, agents)
  };
}
```

**Output attendu**:
```javascript
{
  recommended_agents: ['BYAN', 'ARCHITECT', 'DEV', 'QUINN', 'MARC'],
  rationale: [
    'Backend API projects benefit from architecture guidance (ARCHITECT)',
    'DEV agent accelerates implementation with code generation',
    'QUINN ensures test coverage and quality assurance',
    'MARC enables Copilot CLI integration'
  ]
}
```

**Critères acceptation**:
- ✅ Recommandations pertinentes par type projet
- ✅ Rationale clair et actionnable
- ✅ Tests avec 5 fixtures projets (frontend, backend, fullstack, monorepo, unknown)

---

### Phase 3: Installation (Semaine 2-3, Jours 11-17) - 56h

**Objectif**: Installation agents fonctionnelle (INSTALL-AGENTS)

#### Task 3.1: Sélection Mode (8h)
**Fichier**: `lib/yanstaller/installer.js`

**Fonctionnalités**:
- Menu inquirer (Full/Minimal/Custom)
- Mode Full: 29 agents
- Mode Minimal: 5 agents (BYAN, RACHID, MARC, PATNOTE, CARMACK)
- Mode Custom: Checklist 29 agents

**Tests**:
```javascript
it('should display mode selection menu', async () => {
  const mode = await installer.selectMode();
  expect(mode).toBeOneOf(['full', 'minimal', 'custom']);
});

it('should return 5 agents in minimal mode', () => {
  const agents = installer.getAgentsForMode('minimal');
  expect(agents).toHaveLength(5);
  expect(agents).toContain('byan');
});
```

---

#### Task 3.2: Configuration Utilisateur (8h)
**Fichier**: `lib/yanstaller/interviewer.js`

**Fonctionnalités**:
- Demande nom utilisateur
- Demande langue (FR/EN)
- Demande output folder (ou défaut)
- Génère `config.yaml`

**Tests**:
```javascript
it('should generate config.yaml', async () => {
  const config = await interviewer.collectConfig({
    userName: 'Test User',
    language: 'Francais'
  });
  
  expect(config.user_name).toBe('Test User');
  expect(config.communication_language).toBe('Francais');
});
```

---

#### Task 3.3: Création Structure (8h)
**Fichier**: `lib/utils/file-ops.js`

**Fonctionnalités**:
- Crée `_byan/` (RG-YAN-003: backup si existe)
- Crée sous-dossiers (bmb, core, _config, _memory, _output)
- Crée `.github/agents/`
- Permissions correctes (chmod)

**Tests**:
```javascript
it('should create _byan/ structure', async () => {
  await fileOps.createStructure('/test-project');
  
  expect(fs.existsSync('/test-project/_byan')).toBe(true);
  expect(fs.existsSync('/test-project/_byan/bmb/agents')).toBe(true);
});

it('should backup existing _byan/', async () => {
  // Create existing _byan/
  fs.mkdirSync('/test-project/_byan');
  
  await fileOps.createStructure('/test-project');
  
  expect(fs.existsSync('/test-project/_byan.backup-*')).toBe(true);
});
```

---

#### Task 3.4: Copie Agents (16h)
**Fichier**: `lib/yanstaller/installer.js`

**Fonctionnalités**:
- Copie agents depuis `templates/` vers `_byan/bmb/agents/`
- Génère stubs `.github/agents/` (YAML frontmatter)
- Gère plateformes multiples (Copilot, VSCode, Claude, Codex)
- Progress bar (ora)

**Tests**:
```javascript
it('should copy minimal agents', async () => {
  await installer.installAgents({
    mode: 'minimal',
    projectRoot: '/test-project'
  });
  
  expect(fs.existsSync('/test-project/_byan/bmb/agents/byan.md')).toBe(true);
  expect(fs.existsSync('/test-project/.github/agents/byan.md')).toBe(true);
});

it('should generate correct YAML frontmatter', async () => {
  await installer.installAgents({ mode: 'minimal' });
  
  const stub = fs.readFileSync('.github/agents/byan.md', 'utf8');
  expect(stub).toContain('---');
  expect(stub).toContain('name: "byan"');
  expect(stub).toContain('description:');
});
```

---

#### Task 3.5: Génération Config (8h)
**Fichier**: `lib/yanstaller/installer.js`

**Fonctionnalités**:
- Génère `_byan/bmb/config.yaml`
- Variables résolues (`{project-root}`)
- Métadata installation (version, date, mode)

**Tests**:
```javascript
it('should generate valid config.yaml', async () => {
  await installer.generateConfig({
    userName: 'Test',
    language: 'English',
    mode: 'minimal'
  });
  
  const config = yaml.load(fs.readFileSync('_byan/bmb/config.yaml'));
  expect(config.user_name).toBe('Test');
  expect(config.mode).toBe('minimal');
});
```

---

#### Task 3.6: Multi-Platform Install (8h)
**Fichiers**: `lib/platforms/*.js`

**Fonctionnalités**:
- Copilot CLI: Copie vers `.github/agents/`
- VSCode: Même que Copilot CLI
- Claude Code: Génère MCP config JSON
- Codex: Copie vers `.codex/prompts/`

**Tests**:
```javascript
it('should install for Copilot CLI', async () => {
  await platforms.copilotCLI.install(agents);
  expect(fs.existsSync('.github/agents/byan.md')).toBe(true);
});

it('should install for Claude Code', async () => {
  await platforms.claudeCode.install(agents);
  expect(fs.existsSync('_byan/bmb/agents/yanstaller-mcp-config.json')).toBe(true);
});
```

---

### Phase 4: Validation (Semaine 3, Jours 18-21) - 32h

**Objectif**: Validation automatique post-install (VALIDATE-INSTALLATION)

#### Task 4.1: Checks Filesystem (8h)
**Fichier**: `lib/yanstaller/validator.js`

**Checks (10 total)**:
1. ✅ `_byan/` existe
2. ✅ `_byan/bmb/agents/` contient agents
3. ✅ `.github/agents/` contient stubs
4. ✅ `config.yaml` généré
5. ✅ Permissions correctes (read/write)
6. ✅ Aucune corruption (checksums)
7. ✅ Paths résolvent correctement
8. ✅ YAML frontmatter valide
9. ✅ Platform-specific configs OK
10. ✅ Aucune erreur détectée

**Tests**:
```javascript
it('should pass all filesystem checks', async () => {
  const report = await validator.validateFilesystem('/test-project');
  
  expect(report.passed).toBe(10);
  expect(report.total).toBe(10);
  expect(report.errors).toHaveLength(0);
});
```

---

#### Task 4.2: Tests Détection Agents (8h)
**Fichier**: `lib/yanstaller/validator.js`

**Fonctionnalités**:
- Simule commande `/agent` (Copilot CLI)
- Vérifie agents détectés
- Teste @ mention (VSCode)

**Tests**:
```javascript
it('should validate agent detection in Copilot CLI', async () => {
  const detected = await validator.testAgentDetection();
  expect(detected).toContain('byan');
  expect(detected).toContain('rachid');
});
```

---

#### Task 4.3: YAML Validator (8h)
**Fichier**: `lib/utils/yaml-validator.js`

**Fonctionnalités**:
- Parse YAML frontmatter (js-yaml)
- Valide structure (name, description requis)
- Détecte syntax errors

**Tests**:
```javascript
it('should validate correct YAML frontmatter', () => {
  const yaml = '---\nname: "byan"\ndescription: "Test"\n---';
  const result = yamlValidator.validate(yaml);
  expect(result.valid).toBe(true);
});

it('should detect missing name field', () => {
  const yaml = '---\ndescription: "Test"\n---';
  const result = yamlValidator.validate(yaml);
  expect(result.valid).toBe(false);
  expect(result.error).toContain('name field required');
});
```

---

#### Task 4.4: Rapport Validation (8h)
**Fichier**: `lib/yanstaller/validator.js`

**Output**:
```javascript
{
  passed: 10,
  total: 10,
  status: 'SUCCESS',
  details: [
    { check: '_byan/ exists', status: 'PASS' },
    { check: 'Agents copied', status: 'PASS', count: 5 },
    { check: 'Stubs generated', status: 'PASS' },
    { check: 'YAML valid', status: 'PASS' },
    { check: 'Detection works', status: 'PASS' },
    ...
  ],
  errors: []
}
```

**Tests**:
```javascript
it('should generate validation report', async () => {
  const report = await validator.generateReport('/test-project');
  
  expect(report).toHaveProperty('passed');
  expect(report).toHaveProperty('total');
  expect(report.status).toBeOneOf(['SUCCESS', 'PARTIAL', 'FAILURE']);
});
```

---

### Phase 5: Troubleshooting (Semaine 4, Jours 22-26) - 40h

**Objectif**: Diagnostic et fixes automatiques (TROUBLESHOOT-ISSUES)

#### Task 5.1: Error Detection (12h)
**Fichier**: `lib/yanstaller/troubleshooter.js`

**Errors détectés**:
- Permissions insuffisantes (EACCES)
- Node.js < 18
- Git manquant
- Path resolution errors
- YAML syntax errors
- Network timeouts
- Platform not detected

**Tests**:
```javascript
it('should detect permission error', () => {
  const error = new Error('EACCES: permission denied');
  const diagnosis = troubleshooter.diagnose(error);
  
  expect(diagnosis.type).toBe('permission');
  expect(diagnosis.rootCause).toContain('Insufficient write permissions');
});
```

---

#### Task 5.2: Automatic Fixes (16h)
**Fichier**: `lib/yanstaller/troubleshooter.js`

**Fixes automatiques**:
- YAML regeneration (si syntax error)
- Permissions correction (chmod)
- Stub regeneration (si frontmatter incorrect)
- Retry network (3x with backoff)

**Tests**:
```javascript
it('should auto-fix YAML syntax error', async () => {
  // Create stub with invalid YAML
  fs.writeFileSync('.github/agents/byan.md', 'invalid: yaml: content');
  
  await troubleshooter.autoFix('yaml-error');
  
  const fixed = fs.readFileSync('.github/agents/byan.md', 'utf8');
  expect(yamlValidator.validate(fixed).valid).toBe(true);
});
```

---

#### Task 5.3: Manual Fix Guides (12h)
**Fichier**: `lib/yanstaller/troubleshooter.js`

**Guides**:
- Node.js upgrade (nvm, apt, brew, Windows)
- Git install
- Sudo usage (avec warnings)
- Platform install (Copilot CLI, VSCode extension, etc.)

**Tests**:
```javascript
it('should provide Node.js upgrade guide', () => {
  const guide = troubleshooter.getFixGuide('node-version-old');
  
  expect(guide).toContain('nvm install 20');
  expect(guide).toContain('apt update && apt install nodejs');
  expect(guide).toContain('brew upgrade node');
});
```

---

### Phase 6: Backup/Rollback (Semaine 4-5, Jours 27-29) - 24h

**Objectif**: Sécurité données utilisateur (BACKUP-RESTORE)

#### Task 6.1: Backup Automatique (12h)
**Fichier**: `lib/yanstaller/backuper.js`

**Fonctionnalités**:
- Backup avant overwrite (RG-YAN-003)
- Format: `_byan.backup-{timestamp}/`
- Compression optionnelle (.tar.gz)
- Cleanup old backups (> 5)

**Tests**:
```javascript
it('should backup existing _byan/', async () => {
  fs.mkdirSync('_byan');
  fs.writeFileSync('_byan/test.txt', 'data');
  
  await backuper.backup('_byan');
  
  expect(fs.existsSync('_byan.backup-*')).toBe(true);
  const backupContent = fs.readFileSync('_byan.backup-*/test.txt');
  expect(backupContent.toString()).toBe('data');
});
```

---

#### Task 6.2: Rollback (12h)
**Fichier**: `lib/yanstaller/backuper.js`

**Fonctionnalités**:
- Liste backups disponibles
- Sélection backup (inquirer)
- Restore complet
- Validation post-restore

**Tests**:
```javascript
it('should rollback to latest backup', async () => {
  await backuper.backup('_byan');
  fs.rmSync('_byan', { recursive: true });
  
  await backuper.rollback();
  
  expect(fs.existsSync('_byan')).toBe(true);
});
```

---

### Phase 7: Wizard & Polish (Semaine 5, Jours 30-33) - 32h

**Objectif**: UX finale (POST-INSTALL-WIZARD, GUIDE-QUICK-INTERVIEW)

#### Task 7.1: Post-Install Wizard (16h)
**Fichier**: `lib/yanstaller/wizard.js`

**Fonctionnalités**:
- Menu post-install (3 options)
- [1] Créer premier agent → Lance BYAN
- [2] Tester install → Lance validator
- [3] Exit → Affiche next steps

**Tests**:
```javascript
it('should display post-install menu', async () => {
  const choice = await wizard.show();
  expect(choice).toBeOneOf(['create-agent', 'test', 'exit']);
});
```

---

#### Task 7.2: Quick Interview (16h)
**Fichier**: `lib/yanstaller/interviewer.js`

**Fonctionnalités**:
- Questions personnalisation (5-7 questions)
- Temps < 5 min (vs 30-45 min Intelligent Interview)
- Génère config.yaml enrichi

**Tests**:
```javascript
it('should complete quick interview in < 5 min', async () => {
  const start = Date.now();
  await interviewer.runQuick();
  const duration = Date.now() - start;
  
  expect(duration).toBeLessThan(300000); // 5 min
});
```

---

### Phase 8: Tests & QA (Semaine 5-6, Jours 34-40) - 56h

**Objectif**: Qualité production

#### Task 8.1: Tests Multi-OS (24h)
**Environnements**:
- Windows 10/11 (VM ou GitHub Actions)
- Linux (Ubuntu 22.04, Debian 12)
- macOS 12+ (GitHub Actions)

**Tests**:
```yaml
# .github/workflows/test-multi-os.yml
strategy:
  matrix:
    os: [ubuntu-latest, windows-latest, macos-latest]
    node: [18, 20]
```

---

#### Task 8.2: Tests Intégration (16h)
**Scénarios**:
- Installation complète end-to-end
- Update existing installation
- Rollback après échec
- Multi-plateforme simultané

**Tests**:
```javascript
describe('Integration: Full Installation', () => {
  it('should complete full workflow', async () => {
    // 1. Detect
    const detected = await yanstaller.detect();
    expect(detected.platforms.length).toBeGreaterThan(0);
    
    // 2. Recommend
    const recommended = await yanstaller.recommend();
    expect(recommended.agents.length).toBeGreaterThan(0);
    
    // 3. Install
    await yanstaller.install({ mode: 'minimal' });
    
    // 4. Validate
    const validated = await yanstaller.validate();
    expect(validated.passed).toBe(10);
  });
});
```

---

#### Task 8.3: QA Manuelle (16h)
**Checklist**:
- [ ] Installation sur machine vierge (Windows/Linux/macOS)
- [ ] Installation sur projet existant (brownfield)
- [ ] Tous modes (Full/Minimal/Custom)
- [ ] Toutes plateformes (Copilot/VSCode/Claude/Codex)
- [ ] Troubleshooting fonctionne
- [ ] Backup/Rollback fonctionnent
- [ ] Wizard post-install fonctionnel
- [ ] Documentation README accurate
- [ ] Pas de crash sur edge cases

---

## Timeline Détaillée

### Gantt Chart (5-6 semaines)

```
Week 1 (40h):
├─ Setup (16h)          [=======]
└─ Detection (24h)             [===========]

Week 2 (40h):
├─ Detection (16h)      [=======]
├─ Recomm. (24h)               [===========]

Week 3 (40h):
├─ Install (32h)        [===============]
└─ Validation (8h)                      [===]

Week 4 (40h):
├─ Validation (24h)     [===========]
├─ Troubleshoot (16h)              [=======]

Week 5 (40h):
├─ Troubleshoot (24h)   [===========]
├─ Backup (24h)                [===========]
└─ Wizard (16h)                       [=======]

Week 6 (40h):
├─ Wizard (16h)         [=======]
└─ Tests & QA (56h)            [=======================]
```

**Total**: 240h répartis sur 6 semaines

**Équipe 2 devs**: 120h chacun (3 semaines chacun, parallèle possible)

---

## Dépendances

### Critical Path

```
Setup → Detection → Installation → Validation → Tests
  ↓         ↓            ↓              ↓           ↓
  └─────────┴────────────┴──────────────┴───────────┘
                     (bloquant)
```

### Parallel Tasks

**Peuvent être faits en parallèle**:
- Recommandation (Phase 2) + Installation (Phase 3) → Attendre detection
- Troubleshooting (Phase 5) + Backup (Phase 6)
- Wizard (Phase 7) peut commencer pendant Tests (Phase 8)

---

## Risques & Mitigation

### Risque 1: Timeline trop optimiste
**Probabilité**: Haute (60%)  
**Impact**: Moyen (retard 1-2 semaines)

**Mitigation**:
- Buffer 20% (6 semaines → 7-8 semaines si besoin)
- Scope reduction: Move "Should Have" vers v1.1

---

### Risque 2: Bugs multi-OS subtils
**Probabilité**: Moyenne (40%)  
**Impact**: Élevé (bloque release)

**Mitigation**:
- Tests automatisés dès semaine 1
- CI/CD multi-OS (GitHub Actions)
- QA manuelle 2 semaines avant release

---

### Risque 3: Plateformes changent APIs
**Probabilité**: Faible (15%)  
**Impact**: Élevé (refactoring majeur)

**Mitigation**:
- Abstraction layers (`lib/platforms/*.js`)
- Tests d'intégration avec vraies plateformes
- Monitoring breaking changes (GitHub, Claude, Codex roadmaps)

---

### Risque 4: Dépendances npm incompatibles
**Probabilité**: Faible (10%)  
**Impact**: Moyen (fix rapide)

**Mitigation**:
- Lock versions (`package-lock.json`)
- CI teste avec `npm ci` (pas `npm install`)
- Dependabot alerts

---

## Critères d'Acceptation

### Must Pass (Bloquants pour release)

**Fonctionnel**:
- [ ] ✅ Détection fonctionne sur 3 OS (Windows, Linux, macOS)
- [ ] ✅ Installation 3 modes (Full, Minimal, Custom)
- [ ] ✅ Validation 10/10 checks passed
- [ ] ✅ Support 4 plateformes (Copilot CLI minimum requis)
- [ ] ✅ Troubleshooting détecte 5+ erreurs communes
- [ ] ✅ Backup/Rollback fonctionne

**Qualité**:
- [ ] ✅ Tests unitaires > 80% coverage
- [ ] ✅ Tests intégration 100% pass
- [ ] ✅ 0 critical bugs
- [ ] ✅ QA manuelle validée (3 OS)

**Documentation**:
- [ ] ✅ README complet
- [ ] ✅ Guide troubleshooting
- [ ] ✅ Exemples par plateforme
- [ ] ✅ FAQ (6+ questions)

---

### Should Pass (Nice-to-have, pas bloquants)

- [ ] Recommandations intelligentes (basées projet)
- [ ] Post-install wizard
- [ ] Quick interview < 5 min
- [ ] Tests E2E automatisés (Playwright/Cypress)

---

## Définition of Done

**Par Task**:
- [ ] Code écrit et committé
- [ ] Tests unitaires écrits et passent
- [ ] Code review fait (pair programming ou PR review)
- [ ] Documentation inline (JSDoc)
- [ ] Pas de lint errors
- [ ] Pas de breaking changes non documentés

**Par Phase**:
- [ ] Toutes tasks phase terminées
- [ ] Tests intégration phase passent
- [ ] Demo fonctionnelle
- [ ] README section correspondante mise à jour

**Release v1.0**:
- [ ] Tous "Must Pass" validés
- [ ] npm publish réussi
- [ ] Git tag v1.0.0
- [ ] Annonce (GitHub release, Discord, Twitter)
- [ ] Monitoring post-release (erreurs users)

---

## Équipe & Répartition

### Dev 1 (Yan) - Focus Backend/Core
**Responsabilités**:
- Phases 1-3 (Detection, Recommandation, Installation)
- Architecture modules
- Tests unitaires core
- Integration CI/CD

**Capacités requises**:
- Node.js expert
- CLI tools (inquirer, commander)
- File system operations

---

### Dev 2 - Focus Platforms/QA
**Responsabilités**:
- Phases 4-6 (Validation, Troubleshooting, Backup)
- Support multi-plateformes
- Tests intégration/E2E
- QA manuelle

**Capacités requises**:
- Multi-OS knowledge
- Testing frameworks (Jest)
- Debugging

---

### Collaboration
- **Daily sync** (15 min)
- **Code reviews** (pair programming ou PR reviews)
- **Weekly demos** (validation progress)

---

## Métriques Succès

### KPIs v1.0

**Adoption**:
- 100+ installations première semaine
- 500+ installations premier mois

**Qualité**:
- < 5% taux échec installation
- < 10% support tickets
- 0 critical bugs post-release

**Performance**:
- Temps installation < 2 min (minimal mode)
- Détection < 5 sec
- Validation < 20 sec

**Satisfaction**:
- Sondage post-install >= 4.5/5
- GitHub stars > 50 première semaine

---

## Post-Release (v1.1 Planning)

**Backlog v1.1** (Should Have + feedbacks):
- Analytics opt-in
- Update notifications
- Template customization
- GUI installer (Electron ?)
- More platforms (Cursor, Continue, etc.)

**Timeline v1.1**: 3-4 semaines après v1.0

---

## Conclusion

**YANSTALLER v1.0 est ambitieux mais réalisable.**

**Keys to success**:
✅ Architecture modulaire (découplage phases)  
✅ Tests dès jour 1 (TDD approach)  
✅ CI/CD multi-OS automatique  
✅ Documentation complète (README, guides)  
✅ Scope reduction si besoin (Must Have priorisés)

**Engagement**:
- 5-6 semaines (240h) pour v1.0 FULL
- Équipe 2 devs (120h chacun)
- Merise Agile + TDD + 64 Mantras appliqués

**Let's build it!** 🚀

---

**Créé par**: BYAN-TEST (Intelligent Interview)  
**Date**: 2026-02-03  
**Validation**: Yan  
**Status**: READY TO START
