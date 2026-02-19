#!/usr/bin/env node

/**
 * BYAN v2 - Copilot CLI Wrapper
 * Bridges GitHub Copilot CLI with BYAN v2 Node.js implementation
 */

const path = require('path');
const ByanV2 = require(path.join(__dirname, '../src/byan-v2'));

class ByanCLI {
  constructor() {
    this._byan = null;
    this.currentQuestion = null;
  }

  get byan() {
    if (!this._byan) {
      this._byan = new ByanV2();
    }
    return this._byan;
  }

  async handleCommand(command, args) {
    try {
      switch (command) {
        case 'create':
        case 'start':
          return await this.startInterview();
        
        case 'status':
          return await this.showStatus();
        
        case 'validate':
          return await this.validateAgent(args[0]);

        case 'elo':
          return await this.handleElo(args);

        case 'fc':
          return await this.handleFc(args);
        
        case 'help':
        default:
          return this.showHelp();
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  }

  async startInterview() {
    console.log('BYAN v2.0 - Starting intelligent interview\n');
    console.log('Format: 4 phases x 3 questions = 12 questions total');
    console.log('Duration: ~15 minutes\n');
    
    await this.byan.startSession();
    
    console.log('Session started');
    console.log('Current state:', this.byan.stateMachine.currentState);
    console.log('\nUse Copilot CLI conversation to answer questions');
    console.log('Example: @byan-v2 <your answer>');
    
    return await this.getNextQuestion();
  }

  async getNextQuestion() {
    try {
      this.currentQuestion = await this.byan.getNextQuestion();
      
      const state = this.byan.sessionState;
      const progress = `${state.userResponses.length}/12`;
      
      console.log(`\n${'='.repeat(50)}`);
      console.log(`PHASE: ${state.currentPhase} | Progress: ${progress}`);
      console.log('='.repeat(50) + '\n');
      console.log(`Q: ${this.currentQuestion}\n`);
      
      return this.currentQuestion;
    } catch (error) {
      if (error.message.includes('complete')) {
        return await this.completeInterview();
      }
      throw error;
    }
  }

  async submitAnswer(answer) {
    if (!this.currentQuestion) {
      throw new Error('No active question. Start interview first with: @byan-v2 start');
    }
    
    await this.byan.submitResponse(answer);
    console.log('Answer recorded\n');
    
    return await this.getNextQuestion();
  }

  async completeInterview() {
    console.log('\nInterview complete! Generating agent profile...\n');
    
    const profile = await this.byan.generateProfile();
    
    console.log('Agent profile generated!');
    console.log('Location:', profile.filePath || 'N/A');
    console.log('Name:', profile.name || 'agent');
    console.log('Quality score:', profile.qualityScore || 'N/A');
    console.log('\nYour agent is ready to use!');
    
    return profile;
  }

  async showStatus() {
    const state = this.byan.sessionState;
    const currentState = this.byan.stateMachine.currentState;
    
    console.log('\nBYAN v2 Status\n');
    console.log('State:', currentState);
    console.log('Phase:', state.currentPhase || 'N/A');
    console.log('Progress:', `${state.userResponses.length}/12 questions`);
    console.log('Session ID:', state.sessionId);
    
    if (state.analysisResults) {
      console.log('\nAnalysis complete');
    }
    
    if (state.generatedProfile) {
      console.log('Profile generated');
    }
    
    return state;
  }

  async validateAgent(filePath) {
    if (!filePath) {
      console.error('Usage: @byan-v2 validate <agent-file.md>');
      return;
    }
    
    console.log(`Validating agent: ${filePath}\n`);
    
    const AgentProfileValidator = require(path.join(__dirname, '../src/byan-v2/generation/agent-profile-validator'));
    const validator = new AgentProfileValidator();
    const fs = require('fs');
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const result = validator.validateProfile(content);
    
    console.log('Validation result:', result.isValid ? 'VALID' : 'INVALID');
    
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(err => console.log(`  - ${err}`));
    }
    
    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach(warn => console.log(`  - ${warn}`));
    }
    
    console.log('\nQuality score:', result.qualityScore);
    
    return result;
  }

  /**
   * ELO trust system CLI operations.
   * @param {string[]} args - [subcommand, ...params]
   */
  async handleElo(args) {
    const EloEngine = require(path.join(__dirname, '../src/byan-v2/elo/index'));
    const engine = new EloEngine();
    const [sub, domain, ...rest] = args;

    switch (sub) {
      case 'context': {
        if (!domain) { console.error('Usage: elo context <domain>'); process.exit(1); }
        const ctx = engine.evaluateContext(domain);
        console.log(JSON.stringify({
          domain:             ctx.domain,
          rating:             ctx.rating,
          rd:                 ctx.rd,
          firstBlood:         ctx.firstBlood,
          tiltDetected:       ctx.tiltDetected,
          inDeadZone:         ctx.inDeadZone,
          shouldSoftChallenge:ctx.shouldSoftChallenge,
          scaffoldLevel:      ctx.scaffoldLevel,
          challengeStyle:     ctx.challengeStyle
        }, null, 2));
        console.log('\n--- PROMPT INSTRUCTIONS ---\n' + ctx.promptInstructions);
        break;
      }

      case 'record': {
        if (!domain || !rest[0]) {
          console.error('Usage: elo record <domain> <VALIDATED|BLOCKED|PARTIAL> [blocked_reason]');
          process.exit(1);
        }
        const result     = rest[0].toUpperCase().replace('PARTIAL', 'PARTIALLY_VALID');
        const blockedReason = rest[1] || null;
        const res = engine.recordResult(domain, result, { blockedReason });
        console.log(`[${domain}] ${result} → rating ${res.newRating} (${res.delta >= 0 ? '+' : ''}${res.delta})`);
        console.log('\n' + res.message);
        break;
      }

      case 'dashboard': {
        const target = domain || null;
        if (target) {
          console.log(engine.getDashboard(target));
        } else {
          const summary = engine.getSummary();
          if (!summary.length) { console.log('No ELO data yet.'); break; }
          const header = 'Domaine'.padEnd(16) + 'ELO '.padStart(5) + '  RD '.padStart(5) + '  Tendance'.padStart(10) + '  Derniere activite';
          console.log(header);
          console.log('-'.repeat(header.length));
          for (const d of summary) {
            const trend = d.trend === 'up' ? `↑ +${d.trend_delta}` : d.trend === 'down' ? `↓ ${d.trend_delta}` : `→ ${d.trend_delta >= 0 ? '+' : ''}${d.trend_delta}`;
            console.log(
              d.domain.padEnd(16) +
              String(d.rating).padStart(5) +
              String(d.rd).padStart(6) +
              trend.padStart(11) +
              '  ' + (d.last_active || 'jamais')
            );
          }
        }
        break;
      }

      case 'summary': {
        const summary = engine.getSummary();
        if (!summary.length) { console.log('No ELO data yet.'); break; }
        console.log(JSON.stringify(summary, null, 2));
        const routing = engine.routeLLM();
        console.log(`\nRecommended model: ${routing.model} (${routing.label}) — ${routing.reason}`);
        break;
      }

      case 'declare': {
        if (!domain || !rest[0]) {
          console.error('Usage: elo declare <domain> <beginner|intermediate|advanced|expert|principal>');
          process.exit(1);
        }
        const res = engine.declareExpertise(domain, rest[0]);
        console.log(`[${domain}] Expertise declared: ${res.level} → provisional rating ${res.provisionalRating}`);
        break;
      }

      default:
        console.error('Unknown ELO subcommand. Use: context | record | dashboard | summary | declare');
        process.exit(1);
    }
  }

  async handleFc(args) {
    const FactChecker = require(path.join(__dirname, '../src/byan-v2/fact-check/index'));
    const checker = new FactChecker();
    const [sub, ...rest] = args;

    switch (sub) {
      case 'check': {
        const claim = rest.join(' ');
        if (!claim) { console.error('Usage: fc check <claim text>'); process.exit(1); }
        const result = checker.check(claim);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'parse': {
        const text = rest.join(' ');
        if (!text) { console.error('Usage: fc parse <text to analyze>'); process.exit(1); }
        const claims = checker.parse(text);
        if (!claims.length) {
          console.log('No implicit claims detected.');
        } else {
          console.log(`${claims.length} claim(s) detected:`);
          claims.forEach((c, i) => console.log(`  [${i + 1}] "${c.matched}" at position ${c.position}\n      Context: ...${c.excerpt}...`));
        }
        break;
      }

      case 'verify': {
        const [claim, ...proofParts] = rest;
        const proof = proofParts.join(' ');
        if (!claim || !proof) { console.error('Usage: fc verify "<claim>" "<proof artifact>"'); process.exit(1); }
        const result = checker.verify(claim, proof);
        console.log(`[FACT USER-VERIFIED] ${result.claim}`);
        console.log(`Stored with id: ${result.id}`);
        break;
      }

      case 'graph': {
        const graph = checker.graph.load();
        if (!graph.facts.length) { console.log('Knowledge graph is empty.'); break; }
        console.log(`${graph.facts.length} fact(s) in graph:`);
        graph.facts.forEach(f => {
          const exp = f.expires_at ? ` (expires ${f.expires_at})` : '';
          console.log(`  [${f.status}] [${f.domain}] ${f.claim}${exp}`);
        });
        break;
      }

      case 'sheet': {
        const sessionId = rest[0] || new Date().toISOString().slice(0, 10);
        const graph = checker.graph.load();
        const facts = graph.facts.reduce((acc, f) => {
          const bucket = f.status === 'VERIFIED' ? 'verified' :
                         f.status === 'DISPUTED' ? 'disputed' :
                         f.status === 'OPINION'  ? 'opinions' : 'claims';
          acc[bucket] = acc[bucket] || [];
          acc[bucket].push(f);
          return acc;
        }, {});
        const result = checker.generateFactSheet(sessionId, facts, true);
        console.log(result.content);
        if (result.path) console.log(`\nSaved to: ${result.path}`);
        break;
      }

      default:
        console.error('Unknown FC subcommand. Use: check | parse | verify | graph | sheet');
        process.exit(1);
    }
  }

  showHelp() {
    console.log(`
BYAN v2.0 - Builder of YAN

USAGE:
  @byan-v2 <command> [args]

COMMANDS:
  create, start          Start intelligent interview (12 questions)
  status                 Show current session status
  validate <file>        Validate existing agent profile
  elo <subcommand>       ELO trust system operations (see below)
  fc <subcommand>        Fact-check operations (see below)
  help                   Show this help

ELO SUBCOMMANDS:
  elo context <domain>             Challenge context for a domain
  elo record <domain> <result> [reason]  Record claim result (VALIDATED|BLOCKED|PARTIAL)
  elo dashboard [domain]           Why+how dashboard for a domain
  elo summary                      All domains overview
  elo declare <domain> <level>     Declare expertise (beginner|intermediate|advanced|expert|principal)

INTERVIEW PHASES:
  1. CONTEXT (3Q)        Project goals & tech stack
  2. BUSINESS (3Q)       Domain knowledge & constraints
  3. AGENT_NEEDS (3Q)    Capabilities & communication style
  4. VALIDATION (3Q)     Confirmation & refinement

EXAMPLES:
  @byan-v2 create agent
  @byan-v2 status
  @byan-v2 validate .github/copilot/agents/my-agent.md
  @byan-v2 elo context security
  @byan-v2 elo record javascript VALIDATED
  @byan-v2 elo record security BLOCKED terminology_gap
  @byan-v2 elo dashboard security
  @byan-v2 elo summary
  @byan-v2 elo declare security expert
  @byan-v2 fc check "Redis is always faster than PostgreSQL"
  @byan-v2 fc parse "This is obviously the best approach"
  @byan-v2 fc graph
  @byan-v2 fc sheet 2026-02-19

FC SUBCOMMANDS:
  fc check <claim>               Evaluate a claim (assertion type + confidence)
  fc parse <text>                Auto-detect implicit claims in text
  fc verify "<claim>" "<proof>"  Mark a claim as user-verified
  fc graph                       Show all facts in knowledge graph
  fc sheet [session-id]          Generate Markdown fact sheet

Full docs: README-BYAN-V2.md
`);
  }
}

// CLI Entry Point
if (require.main === module) {
  const cli = new ByanCLI();
  const args = process.argv.slice(2);
  const command = args[0] || 'help';
  const commandArgs = args.slice(1);
  
  cli.handleCommand(command, commandArgs)
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = ByanCLI;
