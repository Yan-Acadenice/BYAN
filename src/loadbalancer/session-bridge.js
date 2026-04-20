/**
 * SessionBridge — Cross-Provider Context Transfer
 *
 * Serializes conversation state from one provider into a provider-agnostic
 * format, then injects it as context into the target provider.
 *
 * Strategy:
 *   1. Extract: conversation messages + files touched + decisions made
 *   2. Summarize: if transcript > max_tokens, use LLM to compress
 *   3. Package: provider-agnostic JSON (PortableContext)
 *   4. Inject: as system prompt prefix on target provider
 */

/**
 * @typedef {object} PortableContext
 * @property {string} conversationId
 * @property {string} sourceProvider
 * @property {string} targetProvider
 * @property {string} summary - Concise conversation summary
 * @property {string[]} filesTouched - Files read/modified
 * @property {string[]} decisions - Key decisions made
 * @property {string} currentTask - What was being worked on
 * @property {object} agentState - BYAN agent state (soul, tao, FD phase, etc.)
 * @property {number} fidelityPct - Estimated context preservation %
 * @property {string} transferredAt - ISO timestamp
 */

class SessionBridge {
  /**
   * @param {object} opts
   * @param {import('./state/db').SharedStateStore} opts.store
   * @param {number} [opts.maxTokens] - Max summary tokens (default: 2000)
   */
  constructor(opts = {}) {
    this.store = opts.store;
    this.maxTokens = opts.maxTokens || 2000;
  }

  /**
   * Extract context from source provider's session.
   * @param {object} provider - ProviderAdapter instance
   * @param {string} conversationId
   * @returns {Promise<PortableContext>}
   */
  async extract(provider, conversationId) {
    const conversation = this.store?.getConversation(conversationId);
    const existingContext = conversation?.context_json
      ? JSON.parse(conversation.context_json)
      : {};

    const switchHistory = this.store?.getSwitchoversForConversation(conversationId) || [];

    return {
      conversationId,
      sourceProvider: provider.name,
      targetProvider: null,
      summary: existingContext.summary || 'No conversation summary available.',
      filesTouched: existingContext.filesTouched || [],
      decisions: existingContext.decisions || [],
      currentTask: existingContext.currentTask || 'Unknown task',
      agentState: existingContext.agentState || {},
      switchHistory: switchHistory.map(s => ({
        from: s.from_provider,
        to: s.to_provider,
        reason: s.reason,
        at: s.switched_at,
      })),
      fidelityPct: existingContext.summary ? 85 : 50,
      transferredAt: new Date().toISOString(),
    };
  }

  /**
   * Update the stored context for a conversation.
   * Called periodically during normal operation to keep context fresh.
   * @param {string} conversationId
   * @param {object} contextUpdate - Partial context to merge
   */
  updateContext(conversationId, contextUpdate) {
    if (!this.store) return;

    const conversation = this.store.getConversation(conversationId);
    if (!conversation) return;

    const existing = conversation.context_json
      ? JSON.parse(conversation.context_json)
      : {};

    const merged = {
      ...existing,
      ...contextUpdate,
      filesTouched: [
        ...new Set([...(existing.filesTouched || []), ...(contextUpdate.filesTouched || [])]),
      ],
      decisions: [
        ...(existing.decisions || []),
        ...(contextUpdate.decisions || []),
      ],
      updatedAt: new Date().toISOString(),
    };

    this.store.updateConversation(conversationId, {
      context_json: JSON.stringify(merged),
    });
  }

  /**
   * Format a PortableContext into a system prompt for the target provider.
   * @param {PortableContext} ctx
   * @returns {string} - Formatted context injection prompt
   */
  formatInjectionPrompt(ctx) {
    const lines = [
      '--- CONTEXT TRANSFER ---',
      `Transferred from: ${ctx.sourceProvider}`,
      `Conversation: ${ctx.conversationId}`,
      `Fidelity: ~${ctx.fidelityPct}%`,
      '',
      '## Summary',
      ctx.summary,
    ];

    if (ctx.currentTask) {
      lines.push('', '## Current Task', ctx.currentTask);
    }

    if (ctx.filesTouched.length > 0) {
      lines.push('', '## Files Touched', ...ctx.filesTouched.map(f => `- ${f}`));
    }

    if (ctx.decisions.length > 0) {
      lines.push('', '## Key Decisions', ...ctx.decisions.map(d => `- ${d}`));
    }

    if (ctx.agentState && Object.keys(ctx.agentState).length > 0) {
      lines.push('', '## Agent State', JSON.stringify(ctx.agentState, null, 2));
    }

    if (ctx.switchHistory && ctx.switchHistory.length > 0) {
      lines.push(
        '', '## Switch History',
        ...ctx.switchHistory.map(s => `- ${s.from} -> ${s.to} (${s.reason}) at ${s.at}`)
      );
    }

    lines.push('', '--- END CONTEXT TRANSFER ---');
    return lines.join('\n');
  }

  /**
   * Full transfer: extract from source, record switchover, format for target.
   * @param {object} sourceProvider
   * @param {string} targetProviderName
   * @param {string} conversationId
   * @param {string} reason
   * @returns {Promise<{context: PortableContext, injectionPrompt: string}>}
   */
  async transfer(sourceProvider, targetProviderName, conversationId, reason) {
    const context = await this.extract(sourceProvider, conversationId);
    context.targetProvider = targetProviderName;

    if (this.store) {
      this.store.recordSwitchover({
        conversationId,
        from: sourceProvider.name,
        to: targetProviderName,
        reason,
        contextSnapshot: JSON.stringify(context),
        fidelityPct: context.fidelityPct,
      });
    }

    const injectionPrompt = this.formatInjectionPrompt(context);

    return { context, injectionPrompt };
  }
}

module.exports = { SessionBridge };
