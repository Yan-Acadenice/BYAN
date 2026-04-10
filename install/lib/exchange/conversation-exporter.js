class ConversationExporter {
  exportJSON(session) {
    validateSession(session);

    return JSON.stringify({
      format: 'byan-chat',
      version: '1.0',
      metadata: {
        sessionId: session.id,
        agent: session.agent || 'unknown',
        cli: session.cli || 'unknown',
        created: session.created || new Date().toISOString(),
        exported: new Date().toISOString(),
        messageCount: (session.messages || []).length
      },
      messages: (session.messages || []).map(m => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || null
      }))
    }, null, 2);
  }

  exportMarkdown(session) {
    validateSession(session);

    const agentName = session.agent || 'unknown';
    const date = formatDate(session.created);
    const messages = session.messages || [];
    const lines = [];

    lines.push(`# BYAN Chat -- ${agentName} -- ${date}`);
    lines.push('');
    lines.push('## Session Info');
    lines.push(`- Agent: ${agentName}`);
    lines.push(`- CLI: ${session.cli || 'unknown'}`);
    lines.push(`- Messages: ${messages.length}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    for (const msg of messages) {
      const heading = msg.role === 'user'
        ? '### User'
        : `### Assistant (${agentName})`;
      lines.push(heading);
      lines.push('');
      lines.push(sanitizeMarkdown(msg.content));
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    return lines.join('\n');
  }

  exportTemplate(session) {
    validateSession(session);

    const prompts = (session.messages || [])
      .filter(m => m.role === 'user')
      .map(m => m.content);

    return JSON.stringify({
      format: 'byan-template',
      version: '1.0',
      metadata: {
        agent: session.agent || 'unknown',
        description: `Template from session ${session.id || 'unknown'}`,
        promptCount: prompts.length
      },
      prompts
    }, null, 2);
  }

  importJSON(data) {
    const parsed = parseJSONSafe(data);
    if (!parsed || parsed.format !== 'byan-chat') {
      throw new Error('Invalid .byan-chat format');
    }
    if (!parsed.version) {
      throw new Error('Missing version in .byan-chat');
    }
    if (!Array.isArray(parsed.messages)) {
      throw new Error('Missing or invalid messages array');
    }

    for (const msg of parsed.messages) {
      if (!msg.role || typeof msg.content !== 'string') {
        throw new Error('Invalid message structure: each message must have role and content');
      }
      if (!['user', 'assistant', 'system'].includes(msg.role)) {
        throw new Error(`Invalid message role: "${msg.role}"`);
      }
    }

    return {
      id: (parsed.metadata && parsed.metadata.sessionId) || null,
      agent: (parsed.metadata && parsed.metadata.agent) || 'unknown',
      cli: (parsed.metadata && parsed.metadata.cli) || 'unknown',
      created: (parsed.metadata && parsed.metadata.created) || new Date().toISOString(),
      messages: parsed.messages
    };
  }

  importTemplate(data) {
    const parsed = parseJSONSafe(data);
    if (!parsed || parsed.format !== 'byan-template') {
      throw new Error('Invalid .byan-template format');
    }
    if (!Array.isArray(parsed.prompts)) {
      throw new Error('Missing or invalid prompts array');
    }
    for (const prompt of parsed.prompts) {
      if (typeof prompt !== 'string') {
        throw new Error('Each prompt must be a string');
      }
    }

    return {
      agent: (parsed.metadata && parsed.metadata.agent) || 'unknown',
      description: (parsed.metadata && parsed.metadata.description) || '',
      prompts: parsed.prompts
    };
  }
}

function validateSession(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('Invalid session object');
  }
  if (!Array.isArray(session.messages)) {
    throw new Error('Session must contain a messages array');
  }
}

function parseJSONSafe(data) {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      throw new Error('Failed to parse JSON data');
    }
  }
  if (Buffer.isBuffer(data)) {
    try {
      return JSON.parse(data.toString('utf8'));
    } catch {
      throw new Error('Failed to parse JSON data from buffer');
    }
  }
  if (typeof data === 'object') {
    return data;
  }
  throw new Error('Invalid input: expected string, Buffer, or object');
}

function sanitizeMarkdown(content) {
  return String(content || '');
}

function formatDate(isoString) {
  if (!isoString) return new Date().toISOString().split('T')[0];
  try {
    return new Date(isoString).toISOString().split('T')[0];
  } catch {
    return isoString;
  }
}

module.exports = ConversationExporter;
