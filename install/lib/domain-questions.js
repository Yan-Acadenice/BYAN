/**
 * Domain-specific questions for Yanstaller Phase 2
 * After generic 10 questions, ask personalized questions based on domain
 */

const domainQuestions = {
  web: [
    {
      name: 'framework',
      message: 'Framework principal?',
      type: 'list',
      choices: ['React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Nuxt', 'Autre']
    },
    {
      name: 'styling',
      message: 'Approche CSS?',
      type: 'list',
      choices: ['Tailwind', 'CSS Modules', 'Styled Components', 'SASS/SCSS', 'Vanilla CSS']
    },
    {
      name: 'stateManagement',
      message: 'State management?',
      type: 'list',
      choices: ['Redux', 'Zustand', 'Pinia', 'Context API', 'Aucun', 'Autre']
    },
    {
      name: 'testing',
      message: 'Framework de test?',
      type: 'list',
      choices: ['Jest', 'Vitest', 'Playwright', 'Cypress', 'Testing Library', 'Aucun']
    }
  ],

  'backend/API': [
    {
      name: 'language',
      message: 'Langage backend?',
      type: 'list',
      choices: ['Node.js', 'Python', 'Go', 'Rust', 'Java', 'C#/.NET', 'PHP']
    },
    {
      name: 'framework',
      message: 'Framework?',
      type: 'list',
      choices: ['Express', 'Fastify', 'NestJS', 'FastAPI', 'Django', 'Flask', 'Gin', 'Autre']
    },
    {
      name: 'database',
      message: 'Base de données principale?',
      type: 'list',
      choices: ['PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'SQLite', 'DynamoDB', 'Autre']
    },
    {
      name: 'apiStyle',
      message: 'Style API?',
      type: 'list',
      choices: ['REST', 'GraphQL', 'gRPC', 'tRPC', 'WebSocket', 'Mixte']
    }
  ],

  devops: [
    {
      name: 'cicd',
      message: 'Outil CI/CD?',
      type: 'list',
      choices: ['GitHub Actions', 'GitLab CI', 'Jenkins', 'CircleCI', 'Azure DevOps', 'ArgoCD']
    },
    {
      name: 'cloud',
      message: 'Cloud provider?',
      type: 'list',
      choices: ['AWS', 'GCP', 'Azure', 'DigitalOcean', 'On-premise', 'Multi-cloud']
    },
    {
      name: 'iac',
      message: 'Infrastructure as Code?',
      type: 'list',
      choices: ['Terraform', 'Pulumi', 'CloudFormation', 'Ansible', 'Chef/Puppet', 'Aucun']
    },
    {
      name: 'containerization',
      message: 'Conteneurisation?',
      type: 'list',
      choices: ['Docker + Kubernetes', 'Docker Compose', 'Podman', 'ECS/Fargate', 'Aucun']
    },
    {
      name: 'monitoring',
      message: 'Monitoring/Observabilité?',
      type: 'list',
      choices: ['Prometheus + Grafana', 'Datadog', 'New Relic', 'CloudWatch', 'ELK Stack', 'Aucun']
    }
  ],

  'data/ML': [
    {
      name: 'focus',
      message: 'Focus principal?',
      type: 'list',
      choices: ['Data Engineering', 'Machine Learning', 'Data Science', 'Analytics/BI', 'MLOps']
    },
    {
      name: 'language',
      message: 'Langage principal?',
      type: 'list',
      choices: ['Python', 'R', 'Scala', 'SQL', 'Julia']
    },
    {
      name: 'framework',
      message: 'Framework ML?',
      type: 'list',
      choices: ['PyTorch', 'TensorFlow', 'Scikit-learn', 'XGBoost', 'Hugging Face', 'Aucun']
    },
    {
      name: 'dataStore',
      message: 'Data store?',
      type: 'list',
      choices: ['Snowflake', 'BigQuery', 'Databricks', 'Redshift', 'PostgreSQL', 'Autre']
    },
    {
      name: 'orchestration',
      message: 'Orchestration data?',
      type: 'list',
      choices: ['Airflow', 'Prefect', 'Dagster', 'Luigi', 'dbt', 'Aucun']
    }
  ],

  mobile: [
    {
      name: 'platform',
      message: 'Plateforme cible?',
      type: 'list',
      choices: ['iOS + Android (cross-platform)', 'iOS natif', 'Android natif', 'PWA']
    },
    {
      name: 'framework',
      message: 'Framework?',
      type: 'list',
      choices: ['React Native', 'Flutter', 'Expo', 'Swift/SwiftUI', 'Kotlin', 'Ionic']
    },
    {
      name: 'backend',
      message: 'Backend mobile?',
      type: 'list',
      choices: ['Firebase', 'Supabase', 'AWS Amplify', 'Custom API', 'Appwrite']
    },
    {
      name: 'distribution',
      message: 'Distribution?',
      type: 'list',
      choices: ['App Store + Play Store', 'Enterprise (MDM)', 'TestFlight/Beta', 'Sideload']
    }
  ],

  'multi-domain': [
    {
      name: 'primaryDomain',
      message: 'Domaine principal?',
      type: 'list',
      choices: ['Frontend', 'Backend', 'Fullstack', 'Infrastructure', 'Data']
    },
    {
      name: 'secondaryDomain',
      message: 'Domaine secondaire?',
      type: 'list',
      choices: ['Frontend', 'Backend', 'DevOps', 'Mobile', 'Data/ML', 'Aucun']
    },
    {
      name: 'integration',
      message: 'Niveau intégration?',
      type: 'list',
      choices: ['Monorepo', 'Microservices', 'Monolithe modulaire', 'Serverless']
    }
  ]
};

/**
 * Get domain-specific questions based on selected domain
 * @param {string} domain - The domain selected in Q8
 * @returns {Array} Array of inquirer question objects
 */
function getDomainQuestions(domain) {
  const questions = domainQuestions[domain] || domainQuestions['multi-domain'];
  
  // Add question numbers starting from 11
  return questions.map((q, index) => ({
    ...q,
    message: `${11 + index}. ${q.message}`
  }));
}

/**
 * Build prompt for Phase 2 agent analysis
 * @param {Object} genericAnswers - Answers from Q1-Q10
 * @param {Object} domainAnswers - Answers from domain-specific questions
 * @param {Object} detectedPlatforms - Detected AI platforms
 * @returns {string} Prompt for agent
 */
function buildPhase2Prompt(genericAnswers, domainAnswers, detectedPlatforms) {
  return [
    'Analyse ce profil projet et génère une configuration d\'agents BYAN optimale.',
    '',
    '## Profil Générique',
    `- Type: ${genericAnswers.projectType}`,
    `- Objectifs: ${genericAnswers.objectives.join(', ')}`,
    `- Équipe: ${genericAnswers.teamSize}`,
    `- Expérience: ${genericAnswers.experience}`,
    `- Méthodologie: ${genericAnswers.methodology}`,
    `- Domaine: ${genericAnswers.domain}`,
    `- Qualité: ${genericAnswers.quality}`,
    '',
    '## Détails Domaine',
    ...Object.entries(domainAnswers).map(([k, v]) => `- ${k}: ${v}`),
    '',
    '## Plateformes',
    `- Détectées: ${Object.entries(detectedPlatforms).filter(([,v]) => v).map(([k]) => k).join(', ')}`,
    '',
    '## Output attendu (JSON)',
    'Retourne UNIQUEMENT un JSON valide:',
    '{',
    '  "coreAgents": [{"name": "...", "role": "...", "expertise": [...], "complexity": "simple|medium|complex"}],',
    '  "optionalAgents": [{"name": "...", "role": "...", "expertise": [...]}],',
    '  "agentRelationships": [{"from": "...", "to": "...", "type": "triggers|blocks|informs|depends"}],',
    '  "projectStructure": {"type": "monorepo|microservices|monolith", "folders": [...]},',
    '  "customAgentsToCreate": [{"name": "...", "template": "analyst|dev|pm|custom", "focus": "..."}],',
    '  "recommendedModel": "gpt-5-mini|claude-haiku|...",',
    '  "rationale": "Brief explanation"',
    '}'
  ].join('\n');
}

module.exports = {
  domainQuestions,
  getDomainQuestions,
  buildPhase2Prompt
};
