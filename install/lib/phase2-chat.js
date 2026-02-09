/**
 * Phase 2 Chat - Interactive conversation with Yanstaller agent
 * 
 * Launches a conversational session with the yanstaller-phase2 agent
 * instead of using inquirer-based questions.
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const readline = require('readline');
const chalk = require('chalk');
const os = require('os');

/**
 * Build the initial context prompt from Phase 1 answers
 */
function buildPhase1Context(interviewAnswers, detectedPlatforms, userName, language) {
  const platformsDetected = [];
  if (detectedPlatforms.copilot) platformsDetected.push('GitHub Copilot CLI');
  if (detectedPlatforms.codex) platformsDetected.push('OpenAI Codex');
  if (detectedPlatforms.claude) platformsDetected.push('Claude Code');
  if (detectedPlatforms.vscode) platformsDetected.push('VSCode');
  
  return {
    user_name: userName || 'Developer',
    communication_language: language || 'Francais',
    project_type: interviewAnswers.projectType,
    objectives: interviewAnswers.objectives,
    team_size: interviewAnswers.teamSize,
    experience: interviewAnswers.experience,
    connectivity: interviewAnswers.connectivity,
    gpu_available: interviewAnswers.gpu,
    methodology: interviewAnswers.methodology,
    domain: interviewAnswers.domain,
    frequency: interviewAnswers.frequency,
    quality_level: interviewAnswers.quality,
    platforms_detected: platformsDetected,
    platforms_string: platformsDetected.join(', ') || 'None'
  };
}

/**
 * Generate the pre-prompt for Phase 2 agent
 */
function generatePhase2Preprompt(context) {
  return `
## Profil Utilisateur Phase 1

- **Nom**: ${context.user_name}
- **Langue**: ${context.communication_language}
- **Type de projet**: ${context.project_type}
- **Domaine**: ${context.domain}
- **Objectifs**: ${Array.isArray(context.objectives) ? context.objectives.join(', ') : context.objectives}
- **Taille équipe**: ${context.team_size}
- **Expérience AI**: ${context.experience}
- **Connectivité**: ${context.connectivity}
- **GPU disponible**: ${context.gpu_available}
- **Méthodologie**: ${context.methodology}
- **Fréquence utilisation**: ${context.frequency}
- **Niveau qualité**: ${context.quality_level}
- **Plateformes détectées**: ${context.platforms_string}

## Instructions

Tu es YANSTALLER Phase 2. Commence par accueillir ${context.user_name} avec un résumé de son profil, puis engage une conversation pour configurer son écosystème d'agents BYAN.

Adapte tes questions au domaine "${context.domain}" et au niveau d'expérience "${context.experience}".

Quand l'utilisateur dit "finaliser", "terminer" ou "c'est bon", génère la configuration JSON finale.
`.trim();
}

/**
 * Launch interactive chat with Phase 2 agent
 * 
 * @param {Object} options Configuration options
 * @param {Object} options.interviewAnswers Phase 1 answers
 * @param {Object} options.detectedPlatforms Detected AI platforms
 * @param {string} options.projectRoot Project root directory
 * @param {string} options.templateDir Templates directory
 * @param {string} options.userName User name
 * @param {string} options.language Communication language
 * @returns {Promise<Object|null>} Phase 2 results or null if cancelled
 */
async function launchPhase2Chat(options) {
  const {
    interviewAnswers,
    detectedPlatforms,
    projectRoot,
    templateDir,
    userName,
    language
  } = options;
  
  // Build context from Phase 1
  const context = buildPhase1Context(interviewAnswers, detectedPlatforms, userName, language);
  const preprompt = generatePhase2Preprompt(context);
  
  // Pre-copy Phase 2 agent to project
  const phase2AgentSource = path.join(templateDir, '.github', 'agents', 'bmad-agent-yanstaller-phase2.md');
  const githubAgentsDir = path.join(projectRoot, '.github', 'agents');
  
  if (await fs.pathExists(phase2AgentSource)) {
    await fs.ensureDir(githubAgentsDir);
    await fs.copy(phase2AgentSource, path.join(githubAgentsDir, 'bmad-agent-yanstaller-phase2.md'), { overwrite: true });
  }
  
  // Write preprompt to temp file
  const prepromptFile = path.join(projectRoot, '.yanstaller-phase2-context.tmp');
  await fs.writeFile(prepromptFile, preprompt, 'utf8');
  
  // Display Phase 2 header
  console.log('');
  console.log(chalk.magenta('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.magenta('║') + '                                                            ' + chalk.magenta('║'));
  console.log(chalk.magenta('║') + `   ${chalk.bold('💬 PHASE 2 - Conversation Yanstaller')}                      ` + chalk.magenta('║'));
  console.log(chalk.magenta('║') + `   ${chalk.gray(`Mode interactif - Domaine: ${context.domain}`)}                     ` + chalk.magenta('║'));
  console.log(chalk.magenta('║') + '                                                            ' + chalk.magenta('║'));
  console.log(chalk.magenta('╚════════════════════════════════════════════════════════════╝'));
  console.log('');
  console.log(chalk.gray('  Tapez vos réponses naturellement.'));
  console.log(chalk.gray('  Dites "finaliser" pour générer la configuration.'));
  console.log(chalk.gray('  Dites "skip" pour passer cette phase.'));
  console.log('');
  
  // Determine which CLI to use
  let cliCommand = null;
  let cliArgs = [];
  
  if (detectedPlatforms.copilot) {
    cliCommand = 'copilot';
    cliArgs = ['--agent=bmad-agent-yanstaller-phase2'];
  } else if (detectedPlatforms.codex) {
    cliCommand = 'codex';
    cliArgs = ['chat'];
  } else if (detectedPlatforms.claude) {
    cliCommand = 'claude';
    cliArgs = [];
  }
  
  if (!cliCommand) {
    console.log(chalk.yellow('  ⚠ Aucune plateforme AI détectée pour le chat.'));
    console.log(chalk.gray('  Passez à la configuration manuelle.'));
    await fs.remove(prepromptFile).catch(() => {});
    return null;
  }
  
  // Launch interactive session
  return new Promise(async (resolve) => {
    try {
      // For copilot, we need to handle it specially
      if (cliCommand === 'copilot') {
        // Use spawn for interactive session
        console.log(chalk.cyan('  🚀 Lancement de la session interactive...'));
        console.log(chalk.gray('  (La session Copilot va s\'ouvrir)'));
        console.log('');
        
        // First, send the initial prompt
        const initialPrompt = `Tu es yanstaller-phase2. Voici le contexte:\n\n${preprompt}\n\nCommence par accueillir l'utilisateur et pose ta première question.`;
        
        const child = spawn(cliCommand, [...cliArgs, '-p', initialPrompt], {
          cwd: projectRoot,
          stdio: 'inherit',
          env: { ...process.env }
        });
        
        child.on('close', async (code) => {
          // Cleanup
          await fs.remove(prepromptFile).catch(() => {});
          
          // Try to read any generated config
          const configFile = path.join(projectRoot, '_byan-output', 'yanstaller-config.json');
          if (await fs.pathExists(configFile)) {
            try {
              const config = await fs.readJson(configFile);
              resolve(config);
              return;
            } catch (e) {
              // Config parsing failed
            }
          }
          
          // Check for inline JSON in conversation log
          const logFile = path.join(projectRoot, '.yanstaller-session.log');
          if (await fs.pathExists(logFile)) {
            try {
              const log = await fs.readFile(logFile, 'utf8');
              const jsonMatch = log.match(/\{[\s\S]*"coreAgents"[\s\S]*\}/);
              if (jsonMatch) {
                const config = JSON.parse(jsonMatch[0]);
                await fs.remove(logFile).catch(() => {});
                resolve(config);
                return;
              }
            } catch (e) {
              // Log parsing failed
            }
          }
          
          resolve(null);
        });
        
        child.on('error', async (err) => {
          console.log(chalk.yellow(`  ⚠ Erreur session: ${err.message}`));
          await fs.remove(prepromptFile).catch(() => {});
          resolve(null);
        });
        
      } else {
        // For other CLIs, use a simpler approach
        console.log(chalk.yellow(`  Mode conversation non disponible pour ${cliCommand}.`));
        console.log(chalk.gray('  Utilisation du mode prompt unique.'));
        
        // Fall back to single prompt mode
        const singlePrompt = `${preprompt}\n\nGénère directement la configuration JSON pour ce projet ${context.domain}.`;
        
        try {
          let result;
          if (cliCommand === 'codex') {
            result = execSync(`codex exec "${singlePrompt}"`, {
              encoding: 'utf8',
              cwd: projectRoot,
              timeout: 120000
            });
          } else {
            result = execSync(`${cliCommand} -p "${singlePrompt}"`, {
              encoding: 'utf8',
              cwd: projectRoot,
              timeout: 120000
            });
          }
          
          // Parse JSON from result
          const jsonMatch = result.match(/\{[\s\S]*"coreAgents"[\s\S]*\}/);
          if (jsonMatch) {
            const config = JSON.parse(jsonMatch[0]);
            await fs.remove(prepromptFile).catch(() => {});
            resolve(config);
            return;
          }
        } catch (e) {
          console.log(chalk.yellow(`  ⚠ Analyse non disponible: ${e.message}`));
        }
        
        await fs.remove(prepromptFile).catch(() => {});
        resolve(null);
      }
      
    } catch (error) {
      console.log(chalk.yellow(`  ⚠ Erreur Phase 2: ${error.message}`));
      await fs.remove(prepromptFile).catch(() => {});
      resolve(null);
    }
  });
}

/**
 * Fallback: Generate default config based on Phase 1 answers only
 */
function generateDefaultConfig(interviewAnswers, detectedPlatforms) {
  const domain = interviewAnswers.domain;
  const quality = interviewAnswers.quality;
  
  // Domain-based defaults
  const domainConfigs = {
    'devops': {
      coreAgents: [
        { name: 'byan', role: 'Meta-agent creator', expertise: ['agent orchestration'], complexity: 'simple' },
        { name: 'architect', role: 'Infrastructure design', expertise: ['cloud architecture', 'IaC'], complexity: 'complex' },
        { name: 'devops', role: 'CI/CD pipeline management', expertise: ['automation', 'deployment'], complexity: 'complex' },
        { name: 'security', role: 'Security scanning', expertise: ['container security', 'vulnerability analysis'], complexity: 'medium' }
      ],
      optionalAgents: [
        { name: 'quinn', role: 'QA automation', expertise: ['testing'], when: 'Integration tests needed' }
      ],
      customAgentsToCreate: [
        { name: 'pipeline-orchestrator', template: 'dev', focus: 'CI/CD optimization', mantras: ['IA-3 Automate Repeatable Work'] }
      ],
      projectStructure: { type: 'monorepo', folders: ['infra/', 'pipelines/', 'scripts/'], keyFiles: ['.github/workflows/', 'Dockerfile'] }
    },
    'web': {
      coreAgents: [
        { name: 'byan', role: 'Meta-agent creator', expertise: ['agent orchestration'], complexity: 'simple' },
        { name: 'ux-designer', role: 'User experience design', expertise: ['UI/UX', 'accessibility'], complexity: 'medium' },
        { name: 'dev', role: 'Frontend development', expertise: ['React', 'CSS', 'TypeScript'], complexity: 'medium' },
        { name: 'quinn', role: 'QA automation', expertise: ['E2E testing', 'visual regression'], complexity: 'medium' }
      ],
      optionalAgents: [
        { name: 'tech-writer', role: 'Documentation', expertise: ['docs'], when: 'API documentation needed' }
      ],
      customAgentsToCreate: [
        { name: 'component-architect', template: 'architect', focus: 'Component library design', mantras: ['IA-24 Clean Code'] }
      ],
      projectStructure: { type: 'monorepo', folders: ['src/', 'components/', 'tests/'], keyFiles: ['package.json', 'tsconfig.json'] }
    },
    'backend/API': {
      coreAgents: [
        { name: 'byan', role: 'Meta-agent creator', expertise: ['agent orchestration'], complexity: 'simple' },
        { name: 'architect', role: 'API design', expertise: ['REST', 'GraphQL', 'database'], complexity: 'complex' },
        { name: 'dev', role: 'Backend development', expertise: ['Node.js', 'Python', 'Go'], complexity: 'medium' },
        { name: 'data-analyst', role: 'Data modeling', expertise: ['Merise', 'SQL'], complexity: 'medium' }
      ],
      optionalAgents: [
        { name: 'security', role: 'API security', expertise: ['OWASP'], when: 'Production deployment' }
      ],
      customAgentsToCreate: [
        { name: 'api-designer', template: 'architect', focus: 'API contract design', mantras: ['IA-1 Trust But Verify'] }
      ],
      projectStructure: { type: 'microservices', folders: ['src/', 'api/', 'models/', 'tests/'], keyFiles: ['openapi.yaml', 'docker-compose.yml'] }
    },
    'data/ML': {
      coreAgents: [
        { name: 'byan', role: 'Meta-agent creator', expertise: ['agent orchestration'], complexity: 'simple' },
        { name: 'data-analyst', role: 'Data engineering', expertise: ['ETL', 'data modeling'], complexity: 'complex' },
        { name: 'dev', role: 'ML development', expertise: ['Python', 'TensorFlow', 'PyTorch'], complexity: 'complex' },
        { name: 'architect', role: 'Data architecture', expertise: ['data lakes', 'pipelines'], complexity: 'complex' }
      ],
      optionalAgents: [
        { name: 'quinn', role: 'Model validation', expertise: ['testing'], when: 'Model accuracy validation needed' }
      ],
      customAgentsToCreate: [
        { name: 'ml-ops', template: 'devops', focus: 'ML pipeline automation', mantras: ['IA-3 Automate Repeatable Work'] }
      ],
      projectStructure: { type: 'monorepo', folders: ['data/', 'models/', 'notebooks/', 'pipelines/'], keyFiles: ['requirements.txt', 'dvc.yaml'] }
    },
    'mobile': {
      coreAgents: [
        { name: 'byan', role: 'Meta-agent creator', expertise: ['agent orchestration'], complexity: 'simple' },
        { name: 'ux-designer', role: 'Mobile UX', expertise: ['iOS HIG', 'Material Design'], complexity: 'medium' },
        { name: 'dev', role: 'Mobile development', expertise: ['React Native', 'Flutter', 'Swift'], complexity: 'medium' },
        { name: 'quinn', role: 'Mobile testing', expertise: ['device testing', 'performance'], complexity: 'medium' }
      ],
      optionalAgents: [
        { name: 'architect', role: 'App architecture', expertise: ['offline-first'], when: 'Offline support needed' }
      ],
      customAgentsToCreate: [
        { name: 'platform-specialist', template: 'dev', focus: 'Platform-specific optimizations', mantras: ['IA-24 Clean Code'] }
      ],
      projectStructure: { type: 'monorepo', folders: ['src/', 'ios/', 'android/', 'shared/'], keyFiles: ['app.json', 'package.json'] }
    },
    'multi-domain': {
      coreAgents: [
        { name: 'byan', role: 'Meta-agent creator', expertise: ['agent orchestration'], complexity: 'simple' },
        { name: 'analyst', role: 'Requirements analysis', expertise: ['Merise', 'user stories'], complexity: 'medium' },
        { name: 'architect', role: 'System design', expertise: ['full-stack architecture'], complexity: 'complex' },
        { name: 'dev', role: 'Full-stack development', expertise: ['versatile'], complexity: 'medium' }
      ],
      optionalAgents: [
        { name: 'pm', role: 'Project management', expertise: ['prioritization'], when: 'Multiple stakeholders' }
      ],
      customAgentsToCreate: [],
      projectStructure: { type: 'monorepo', folders: ['frontend/', 'backend/', 'shared/', 'docs/'], keyFiles: ['package.json', 'docker-compose.yml'] }
    }
  };
  
  const config = domainConfigs[domain] || domainConfigs['multi-domain'];
  
  // Add common fields
  config.agentRelationships = [
    { from: 'analyst', to: 'architect', type: 'informs', description: 'Requirements inform architecture decisions' },
    { from: 'architect', to: 'dev', type: 'triggers', description: 'Architecture triggers implementation' }
  ];
  
  // Set model based on quality
  config.recommendedModel = quality === 'critical' ? 'claude-sonnet-4' : 
                            quality === 'production' ? 'gpt-5.1-codex' : 'gpt-5-mini';
  
  config.rationale = `Configuration par défaut pour projet ${domain}. Personnalisez via la conversation Phase 2 pour plus de précision.`;
  
  return config;
}

module.exports = {
  launchPhase2Chat,
  generateDefaultConfig,
  buildPhase1Context,
  generatePhase2Preprompt
};
