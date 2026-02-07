#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

class BmadToByanMigrator {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.bmadPath = path.join(projectRoot, '_bmad');
    this.byanPath = path.join(projectRoot, '_byan');
    this.dryRun = process.argv.includes('--dry-run');
    
    this.migrationMap = {
      agents: ['byan.md', 'byan-test.md', 'rachid.md', 'marc.md']
    };
  }

  log(message) {
    const prefix = this.dryRun ? '[DRY-RUN] ' : '';
    console.log(`${prefix}${message}`);
  }

  async run() {
    this.log('Starting migration: _bmad -> _byan');
    
    try {
      await this.validateSource();
      await this.createTargetStructure();
      await this.migrateAgents();
      await this.migrateConfig();
      await this.createTemplates();
      await this.createDataDirectory();
      this.printSummary();
      this.log('Migration completed!');
    } catch (error) {
      this.log(`Migration failed: ${error.message}`);
      process.exit(1);
    }
  }

  async validateSource() {
    if (!fs.existsSync(this.bmadPath)) {
      throw new Error('_bmad/ directory not found');
    }
  }

  async createTargetStructure() {
    const dirs = [
      this.byanPath,
      path.join(this.byanPath, 'agents'),
      path.join(this.byanPath, 'workflows'),
      path.join(this.byanPath, 'templates'),
      path.join(this.byanPath, 'data'),
      path.join(this.byanPath, 'memory')
    ];
    
    for (const dir of dirs) {
      if (!this.dryRun) {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
          this.log(`Created: ${path.relative(this.projectRoot, dir)}`);
        }
      } else {
        this.log(`Would create: ${path.relative(this.projectRoot, dir)}`);
      }
    }
  }

  async migrateAgents() {
    const sourcePath = path.join(this.bmadPath, 'bmb', 'agents');
    const targetPath = path.join(this.byanPath, 'agents');
    
    for (const agentFile of this.migrationMap.agents) {
      const source = path.join(sourcePath, agentFile);
      const target = path.join(targetPath, agentFile);
      
      if (fs.existsSync(source)) {
        if (!this.dryRun) {
          fs.copyFileSync(source, target);
          this.log(`Copied: ${agentFile}`);
        } else {
          this.log(`Would copy: ${agentFile}`);
        }
      }
    }
  }

  async migrateConfig() {
    const targetConfig = path.join(this.byanPath, 'config.yaml');
    
    const config = `# BYAN Configuration
user_name: Yan
communication_language: Francais
document_output_language: Francais
output_folder: "{project-root}/_byan-output"
agents_folder: "{project-root}/_byan/agents"
byan_version: "2.0.0"
`;
    
    if (!this.dryRun) {
      fs.writeFileSync(targetConfig, config, 'utf-8');
      this.log('Created config.yaml');
    }
  }

  async createTemplates() {
    const template = `---
name: 'basic-agent'
---
# Basic Agent Template
`;
    const targetPath = path.join(this.byanPath, 'templates', 'basic-agent.md');
    
    if (!this.dryRun) {
      fs.writeFileSync(targetPath, template, 'utf-8');
      this.log('Created template');
    }
  }

  async createDataDirectory() {
    const catalog = {
      version: "1.0.0",
      agents: [{ id: "byan-v2", name: "BYAN v2", file: "byan.md" }]
    };
    
    if (!this.dryRun) {
      const catalogPath = path.join(this.byanPath, 'data', 'agent-catalog.json');
      fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
      this.log('Created catalog');
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(50));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(50));
    console.log(`New structure: ${this.byanPath}`);
    console.log('Next: Review _byan/ and test');
    console.log('='.repeat(50) + '\n');
  }
}

const migrator = new BmadToByanMigrator();
migrator.run();
