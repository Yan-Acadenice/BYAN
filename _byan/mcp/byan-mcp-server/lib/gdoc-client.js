// gdoc-client -- headless, byan-owned Google Docs publisher (service account).
//
// Turns a content object (see gdoc-content) into a branded Google Doc and returns
// its URL. Auth is a SERVICE ACCOUNT key (JWT, durable, no browser, no refresh
// token, no ~7-day expiry) -- distinct from the gw OAuth path. The SA key path is
// resolved with the same precedence as the rest of the server (env ->
// ~/.byan/credentials.json), via resolve-config.
//
// CONTRACT : never throws. Every failure (no key, dep not installed, API error)
// is returned as { ok:false, reason, message } so the MCP tool surfaces a clean
// message instead of crashing the server. On success : { ok:true, documentId,
// url }.
//
// TESTABILITY : googleapis is LAZY-loaded through an injectable `load()` so (a)
// the server boots even when googleapis is not installed, and (b) tests inject a
// mock and never touch the network or the real dependency.

import fs from 'node:fs';
import { resolveConfig } from './resolve-config.js';

// Narrowest scopes that let the SA create a Doc and share it : per-file Drive
// access + Docs editing. Not the broad .../auth/drive.
const SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.file',
];

function oneLine(err) {
  return String((err && err.message) || err).split('\n')[0];
}

// Default lazy loader : import googleapis only when a publish actually runs. A
// missing dependency is caught by the caller and turned into reason:'dep-missing'
// -- it must NOT crash the server at import time.
async function defaultLoad() {
  const mod = await import('googleapis');
  return { google: mod.google || (mod.default && mod.default.google) };
}

/**
 * Read + parse the service-account JSON key at `keyPath`. Returns the parsed
 * credentials object, or null on any failure (missing/unreadable/invalid).
 */
function readServiceAccount(keyPath, readFileSync) {
  try {
    const raw = readFileSync(keyPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.client_email && parsed.private_key) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * createPublisher(deps) -> { publish, status }. All side-effecting deps are
 * injectable so the flow is fully unit-testable.
 * @param {object} [deps]
 * @param {Function} [deps.load]          async () => ({ google }) ; default lazy-imports googleapis
 * @param {Function} [deps.resolve]       () => config ; default resolveConfig
 * @param {Function} [deps.readFileSync]  default fs.readFileSync (reads the SA key)
 */
function createPublisher(deps = {}) {
  const load = deps.load || defaultLoad;
  const resolve = deps.resolve || resolveConfig;
  const readFileSync = deps.readFileSync || fs.readFileSync;

  // Read-only view of whether a SA key is configured (for a doctor/status surface).
  function status() {
    const cfg = resolve();
    const keyPath = cfg.GOOGLE_APPLICATION_CREDENTIALS || '';
    const sa = keyPath ? readServiceAccount(keyPath, readFileSync) : null;
    return {
      credentialsConfigured: Boolean(keyPath),
      credentialsValid: Boolean(sa),
      clientEmail: sa ? sa.client_email : null,
      templateConfigured: Boolean(cfg.GDOC_TEMPLATE_ID),
    };
  }

  /**
   * publish(content, opts) -> { ok, documentId?, url?, mode?, shared?, reason?, message? }.
   * opts : { templateId?, shareWith?, role? }. Never throws.
   */
  async function publish(content, opts = {}) {
    const cfg = resolve();

    // 1. SA key present + valid ?
    const keyPath = cfg.GOOGLE_APPLICATION_CREDENTIALS || '';
    if (!keyPath) {
      return {
        ok: false,
        reason: 'no-credentials',
        message:
          'Aucune cle service account. Definis GOOGLE_APPLICATION_CREDENTIALS (chemin du JSON) dans l\'env ou ~/.byan/credentials.json. Voir docs/google-docs-publish.md.',
      };
    }
    const credentials = readServiceAccount(keyPath, readFileSync);
    if (!credentials) {
      return {
        ok: false,
        reason: 'bad-credentials',
        message: `La cle service account a ${keyPath} est introuvable ou invalide (client_email + private_key requis).`,
      };
    }

    // 2. content shape (pure) -- import lazily to keep this module's top clean.
    let content$;
    let buildReplaceRequests;
    let buildDocumentRequests;
    try {
      const gc = await import('./gdoc-content.js');
      content$ = gc.normalizeContent(content);
      buildReplaceRequests = gc.buildReplaceRequests;
      buildDocumentRequests = gc.buildDocumentRequests;
    } catch (err) {
      return { ok: false, reason: 'invalid-content', message: oneLine(err) };
    }

    // 3. googleapis available ?
    let google;
    try {
      ({ google } = await load());
      if (!google) throw new Error('googleapis loaded but google export missing');
    } catch {
      return {
        ok: false,
        reason: 'dep-missing',
        message:
          'googleapis non installe. Lance : npm install googleapis google-auth-library (dans _byan/mcp/byan-mcp-server).',
      };
    }

    // 4. auth + API + publish. Any API failure -> graceful api-error.
    try {
      const auth = new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
      const docs = google.docs({ version: 'v1', auth });
      const drive = google.drive({ version: 'v3', auth });

      const templateId = opts.templateId || cfg.GDOC_TEMPLATE_ID || '';
      let documentId;
      let mode;

      if (templateId) {
        const copy = await drive.files.copy({
          fileId: templateId,
          requestBody: { name: content$.title },
          fields: 'id',
        });
        documentId = copy.data.id;
        mode = 'template';
        await docs.documents.batchUpdate({
          documentId,
          requestBody: { requests: buildReplaceRequests(content) },
        });
      } else {
        const created = await docs.documents.create({
          requestBody: { title: content$.title },
        });
        documentId = created.data.documentId;
        mode = 'programmatic';
        await docs.documents.batchUpdate({
          documentId,
          requestBody: {
            requests: buildDocumentRequests(content, {
              logoPngUrl: opts.logoPngUrl || cfg.GDOC_LOGO_PNG_URL || '',
            }),
          },
        });
      }

      let shared = false;
      if (opts.shareWith) {
        await drive.permissions.create({
          fileId: documentId,
          requestBody: {
            type: 'user',
            role: opts.role === 'commenter' || opts.role === 'writer' ? opts.role : 'reader',
            emailAddress: opts.shareWith,
          },
          sendNotificationEmail: false,
        });
        shared = true;
      }

      return {
        ok: true,
        documentId,
        url: `https://docs.google.com/document/d/${documentId}/edit`,
        mode,
        shared,
      };
    } catch (err) {
      return { ok: false, reason: 'api-error', message: oneLine(err) };
    }
  }

  return { publish, status };
}

export { createPublisher, readServiceAccount, SCOPES };
