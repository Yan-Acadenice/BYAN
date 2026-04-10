const https = require('https');
const { execFile } = require('child_process');

class GistClient {
  async exportToGist(agentPackage) {
    if (!agentPackage || !agentPackage.metadata) {
      throw new Error('Invalid agent package: missing metadata');
    }

    const name = agentPackage.metadata.name || 'agent';
    const displayName = agentPackage.metadata.displayName || name;
    const filename = `${sanitizeFilename(name)}.byan-agent`;
    const content = JSON.stringify(agentPackage, null, 2);
    const description = `BYAN Agent: ${displayName}`;

    if (await this.isGHAvailable()) {
      return this._exportWithGH(filename, content, description);
    }

    const token = process.env.GITHUB_TOKEN;
    if (token) {
      return this._exportWithAPI(filename, content, description, token);
    }

    throw new Error(
      'No GitHub authentication available. Install gh CLI and run "gh auth login", or set GITHUB_TOKEN env var.'
    );
  }

  async importFromGist(url) {
    const gistId = extractGistId(url);
    if (!gistId) {
      throw new Error(`Cannot extract gist ID from URL: ${url}`);
    }

    const gistData = await this._fetchJSON(`https://api.github.com/gists/${gistId}`);
    if (!gistData.files) {
      throw new Error('Gist has no files');
    }

    const byanFile = Object.keys(gistData.files).find(f => f.endsWith('.byan-agent'));
    if (!byanFile) {
      throw new Error('No .byan-agent file found in gist');
    }

    const fileObj = gistData.files[byanFile];
    let content = fileObj.content;

    if (fileObj.truncated && fileObj.raw_url) {
      content = await this._fetchRaw(fileObj.raw_url);
    }

    try {
      return JSON.parse(content);
    } catch {
      throw new Error('Failed to parse .byan-agent content from gist');
    }
  }

  async importFromURL(url) {
    const urlStr = String(url).trim();
    if (!urlStr.startsWith('https://') && !urlStr.startsWith('http://')) {
      throw new Error('URL must start with http:// or https://');
    }

    const content = await this._fetchRaw(urlStr);

    try {
      return JSON.parse(content);
    } catch {
      throw new Error('Failed to parse .byan-agent content from URL');
    }
  }

  async isGHAvailable() {
    try {
      await execCommand('gh', ['auth', 'status']);
      return true;
    } catch {
      return false;
    }
  }

  async _exportWithGH(filename, content, description) {
    const tempContent = content;
    const result = await execCommand('gh', [
      'gist', 'create',
      '--desc', description,
      '--filename', filename,
      '-'
    ], { input: tempContent });

    const gistUrl = result.stdout.trim();
    if (!gistUrl.startsWith('https://')) {
      throw new Error(`Unexpected gh output: ${gistUrl}`);
    }
    return gistUrl;
  }

  async _exportWithAPI(filename, content, description, token) {
    const payload = JSON.stringify({
      description,
      public: false,
      files: {
        [filename]: { content }
      }
    });

    const response = await this._apiRequest('POST', 'https://api.github.com/gists', payload, token);
    if (!response.html_url) {
      throw new Error('GitHub API did not return a gist URL');
    }
    return response.html_url;
  }

  _fetchJSON(url) {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': 'BYAN-Exchange/1.0',
          'Accept': 'application/json'
        }
      };

      const token = process.env.GITHUB_TOKEN;
      if (token) {
        options.headers['Authorization'] = `token ${token}`;
      }

      https.get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this._fetchJSON(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
          return;
        }

        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON response'));
          }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  _fetchRaw(url) {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : require('http');
      const options = {
        headers: { 'User-Agent': 'BYAN-Exchange/1.0' }
      };

      const token = process.env.GITHUB_TOKEN;
      if (token && url.includes('github')) {
        options.headers['Authorization'] = `token ${token}`;
      }

      protocol.get(url, options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this._fetchRaw(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
          return;
        }

        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve(data));
        res.on('error', reject);
      }).on('error', reject);
    });
  }

  _apiRequest(method, url, body, token) {
    return new Promise((resolve, reject) => {
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname,
        method,
        headers: {
          'User-Agent': 'BYAN-Exchange/1.0',
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Authorization': `token ${token}`
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 400) {
            reject(new Error(`GitHub API error ${res.statusCode}: ${data}`));
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error('Invalid JSON from GitHub API'));
          }
        });
        res.on('error', reject);
      });

      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }
}

function sanitizeFilename(name) {
  return String(name).replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 100) || 'agent';
}

function extractGistId(url) {
  const str = String(url).trim();
  const match = str.match(/gist\.github\.com\/(?:[^/]+\/)?([a-f0-9]+)/);
  if (match) return match[1];
  const idMatch = str.match(/^([a-f0-9]{20,})$/);
  if (idMatch) return idMatch[1];
  return null;
}

function execCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = execFile(cmd, args, {
      timeout: 30000,
      maxBuffer: 1024 * 1024
    }, (err, stdout, stderr) => {
      if (err) {
        reject(new Error(`${cmd} failed: ${err.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });

    if (options.input && proc.stdin) {
      proc.stdin.write(options.input);
      proc.stdin.end();
    }
  });
}

module.exports = GistClient;
