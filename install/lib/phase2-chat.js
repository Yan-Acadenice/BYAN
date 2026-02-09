/**
 * Phase 2 Chat - Integrated conversation within the wizard
 * 
 * Provides an in-wizard chat experience with the yanstaller-phase2 agent
 * using copilot/codex CLI for AI responses.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');

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
 * Send a message to the AI and get a response
 * 
 * @param {string} message User message
 * @param {string} systemContext System context/preprompt
 * @param {string} conversationHistory Previous conversation
 * @param {Object} detectedPlatforms Available AI platforms
 * @param {string} projectRoot Project root directory
 * @returns {Promise<string>} AI response
 */
async function sendChatMessage(message, systemContext, conversationHistory, detectedPlatforms, projectRoot) {
  // Build the full prompt with context and history
  const fullPrompt = `${systemContext}

## Historique de conversation:
${conversationHistory}

## Message utilisateur:
${message}

## Instructions:
Réponds de manière concise et naturelle. Si l'utilisateur dit "finaliser", génère le JSON de configuration.
Continue la conversation pour comprendre le projet et personnaliser les agents.`;

  let result = '';
  
  try {
    if (detectedPlatforms.copilot) {
      // Use copilot with single prompt mode (-s for silent, no interactive)
      const escaped = fullPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      result = execSync(`copilot -p "${escaped}" -s 2>/dev/null`, {
        encoding: 'utf8',
        cwd: projectRoot,
        timeout: 60000,
        maxBuffer: 1024 * 1024
      });
    } else if (detectedPlatforms.codex) {
      const escaped = fullPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      result = execSync(`codex -p "${escaped}" --quiet 2>/dev/null`, {
        encoding: 'utf8',
        cwd: projectRoot,
        timeout: 60000,
        maxBuffer: 1024 * 1024
      });
    } else if (detectedPlatforms.claude) {
      const escaped = fullPrompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
      result = execSync(`claude -p "${escaped}" --no-input 2>/dev/null`, {
        encoding: 'utf8',
        cwd: projectRoot,
        timeout: 60000,
        maxBuffer: 1024 * 1024
      });
    }
  } catch (error) {
    result = `Désolé, erreur de communication. Réessayez ou tapez "skip".`;
  }
  
  // Clean up the response (remove ANSI codes, extra whitespace)
  result = result.replace(/\x1b\[[0-9;]*m/g, '').trim();
  
  return result;
}

/**
 * Launch integrated chat within the wizard
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
  const systemContext = generatePhase2Preprompt(context);
  
  // Pre-copy Phase 2 agent to project
  const phase2AgentSource = path.join(templateDir, '.github', 'agents', 'bmad-agent-yanstaller-phase2.md');
  const githubAgentsDir = path.join(projectRoot, '.github', 'agents');
  
  if (await fs.pathExists(phase2AgentSource)) {
    await fs.ensureDir(githubAgentsDir);
    await fs.copy(phase2AgentSource, path.join(githubAgentsDir, 'bmad-agent-yanstaller-phase2.md'), { overwrite: true });
  }
  
  // Display Phase 2 header
  console.log('');
  console.log(chalk.magenta('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.magenta('║') + '                                                            ' + chalk.magenta('║'));
  console.log(chalk.magenta('║') + `   ${chalk.bold('💬 PHASE 2 - Conversation Yanstaller')}                      ` + chalk.magenta('║'));
  console.log(chalk.magenta('║') + `   ${chalk.gray(`Mode interactif - Domaine: ${context.domain}`)}                     ` + chalk.magenta('║'));
  console.log(chalk.magenta('║') + '                                                            ' + chalk.magenta('║'));
  console.log(chalk.magenta('╚════════════════════════════════════════════════════════════╝'));
  console.log('');
  console.log(chalk.gray('  Commandes: "finaliser" | "skip" | "aide"'));
  console.log('');
  
  // Check if any AI platform is available
  if (!detectedPlatforms.copilot && !detectedPlatforms.codex && !detectedPlatforms.claude) {
    console.log(chalk.yellow('  ⚠ Aucune plateforme AI détectée pour le chat.'));
    return null;
  }
  
  // Get initial AI greeting
  const spinner = ora('Yanstaller réfléchit...').start();
  let conversationHistory = '';
  
  const initialMessage = `Commence par accueillir l'utilisateur ${context.user_name} avec un résumé de son profil (domaine: ${context.domain}, objectifs: ${context.objectives?.join(', ') || 'non spécifiés'}) et pose ta première question pour personnaliser son installation BYAN.`;
  
  const greeting = await sendChatMessage(initialMessage, systemContext, '', detectedPlatforms, projectRoot);
  spinner.stop();
  
  console.log(chalk.cyan('  Yanstaller:'));
  console.log(chalk.white('  ' + greeting.split('\n').join('\n  ')));
  console.log('');
  
  conversationHistory += `Assistant: ${greeting}\n\n`;
  
  // Chat loop using inquirer (avoids readline/inquirer conflict)
  let phase2Config = null;
  let continueChat = true;
  
  while (continueChat) {
    // Get user input using inquirer
    const { userInput } = await inquirer.prompt([
      {
        type: 'input',
        name: 'userInput',
        message: '> Vous:',
        prefix: ' '
      }
    ]);
    
    const input = userInput.trim().toLowerCase();
    
    // Handle special commands
    if (input === 'skip' || input === 'passer') {
      console.log(chalk.gray('  Phase 2 ignorée.'));
      return null;
    }
    
    if (input === 'aide' || input === 'help') {
      console.log('');
      console.log(chalk.cyan('  Commandes disponibles:'));
      console.log(chalk.gray('    finaliser - Générer la configuration et continuer'));
      console.log(chalk.gray('    skip      - Passer cette phase'));
      console.log(chalk.gray('    aide      - Afficher cette aide'));
      console.log('');
      continue;
    }
    
    // Add user message to history
    conversationHistory += `Utilisateur: ${userInput}\n\n`;
    
    // Check for finalization
    const wantsFinal = input.includes('finaliser') || 
                      input.includes('terminer') || 
                      input.includes('c\'est bon') ||
                      input.includes('fini');
    
    // Send to AI
    const chatSpinner = ora('Yanstaller réfléchit...').start();
    
    let aiPrompt = userInput;
    if (wantsFinal) {
      aiPrompt = `${userInput}

IMPORTANT: L'utilisateur veut finaliser. Génère maintenant la configuration JSON complète avec ce format exact:
\`\`\`json
{
  "coreAgents": [...],
  "optionalAgents": [...],
  "agentRelationships": [...],
  "projectStructure": {...},
  "customAgentsToCreate": [...],
  "recommendedModel": "string",
  "rationale": "string"
}
\`\`\``;
    }
    
    const response = await sendChatMessage(aiPrompt, systemContext, conversationHistory, detectedPlatforms, projectRoot);
    chatSpinner.stop();
    
    console.log('');
    console.log(chalk.cyan('  Yanstaller:'));
    console.log(chalk.white('  ' + response.split('\n').join('\n  ')));
    console.log('');
    
    conversationHistory += `Assistant: ${response}\n\n`;
    
    // Try to extract JSON config from response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)```/) || 
                     response.match(/\{[\s\S]*"coreAgents"[\s\S]*\}/);
    
    if (jsonMatch) {
      try {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        phase2Config = JSON.parse(jsonStr.trim());
        console.log(chalk.green('  ✓ Configuration extraite!'));
        console.log('');
        continueChat = false;
      } catch (e) {
        // JSON parse failed, continue conversation
      }
    }
    
    // If user wanted to finalize but we didn't get valid JSON
    if (wantsFinal && !phase2Config) {
      console.log(chalk.yellow('  ⚠ Configuration non générée. Réessayez "finaliser" ou "skip".'));
      console.log('');
    }
  }
  
  return phase2Config;
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
