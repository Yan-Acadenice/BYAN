import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPublisher } from '../lib/gdoc-client.js';

// Fake service-account key -- SHAPE ONLY, never a real secret. The client only
// checks client_email + private_key are present.
const FAKE_SA = JSON.stringify({
  client_email: 'sa@p.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----\n',
});

function makeGoogle(opts = {}) {
  const calls = { create: [], copy: [], batchUpdate: [], permissions: [], auth: [] };
  const google = {
    auth: {
      GoogleAuth: class {
        constructor(o) {
          calls.auth.push(o);
        }
      },
    },
    docs: () => ({
      documents: {
        create: async (req) => {
          calls.create.push(req);
          if (opts.failCreate) throw new Error('create boom');
          return { data: { documentId: 'DOC123' } };
        },
        batchUpdate: async (req) => {
          calls.batchUpdate.push(req);
          if (opts.failBatch) throw new Error('batch boom');
          return { data: {} };
        },
      },
    }),
    drive: () => ({
      files: {
        copy: async (req) => {
          calls.copy.push(req);
          return { data: { id: 'COPY123' } };
        },
      },
      permissions: {
        create: async (req) => {
          calls.permissions.push(req);
          return { data: {} };
        },
      },
    }),
  };
  return { google, calls };
}

// Build injectable deps with a valid SA + configurable resolve + google mock.
function deps({ cfg = {}, sa = FAKE_SA, google, loadThrows = false } = {}) {
  const resolved = {
    GOOGLE_APPLICATION_CREDENTIALS: '/fake/sa.json',
    GDOC_TEMPLATE_ID: '',
    GDOC_LOGO_PNG_URL: '',
    ...cfg,
  };
  return {
    resolve: () => resolved,
    readFileSync: () => {
      if (sa === null) throw new Error('ENOENT');
      return sa;
    },
    load: async () => {
      if (loadThrows) throw new Error('Cannot find module googleapis');
      return { google };
    },
  };
}

test('no GOOGLE_APPLICATION_CREDENTIALS -> ok:false no-credentials (never throws)', async () => {
  const { google } = makeGoogle();
  const pub = createPublisher(deps({ cfg: { GOOGLE_APPLICATION_CREDENTIALS: '' }, google }));
  const r = await pub.publish({ title: 'T' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no-credentials');
});

test('SA key path set but file invalid -> bad-credentials', async () => {
  const { google } = makeGoogle();
  const pub = createPublisher(deps({ sa: '{}', google }));
  const r = await pub.publish({ title: 'T' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'bad-credentials');
});

test('invalid content (no title) -> invalid-content, before any API call', async () => {
  const { google, calls } = makeGoogle();
  const pub = createPublisher(deps({ google }));
  const r = await pub.publish({});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'invalid-content');
  assert.equal(calls.create.length, 0);
});

test('googleapis not installed (load throws) -> dep-missing', async () => {
  const pub = createPublisher(deps({ loadThrows: true, google: undefined }));
  const r = await pub.publish({ title: 'T' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'dep-missing');
});

test('programmatic mode (no template): create + batchUpdate with insertText', async () => {
  const { google, calls } = makeGoogle();
  const pub = createPublisher(deps({ google }));
  const r = await pub.publish({ title: 'Bilan', sections: [{ heading: 'H', body: 'B' }] });
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'programmatic');
  assert.equal(r.documentId, 'DOC123');
  assert.match(r.url, /DOC123/);
  assert.equal(calls.create.length, 1);
  assert.equal(calls.copy.length, 0);
  assert.ok(calls.batchUpdate[0].requestBody.requests[0].insertText);
});

test('template mode (GDOC_TEMPLATE_ID): copy + batchUpdate with replaceAllText', async () => {
  const { google, calls } = makeGoogle();
  const pub = createPublisher(deps({ cfg: { GDOC_TEMPLATE_ID: 'TPL' }, google }));
  const r = await pub.publish({ title: 'Bilan' });
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'template');
  assert.equal(r.documentId, 'COPY123');
  assert.equal(calls.copy[0].fileId, 'TPL');
  assert.equal(calls.copy[0].requestBody.name, 'Bilan');
  assert.ok(calls.batchUpdate[0].requestBody.requests[0].replaceAllText);
});

test('opts.templateId overrides config; shareWith creates a reader permission', async () => {
  const { google, calls } = makeGoogle();
  const pub = createPublisher(deps({ google }));
  const r = await pub.publish(
    { title: 'T' },
    { templateId: 'OVERRIDE', shareWith: 'jury@acadenice.fr' }
  );
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'template');
  assert.equal(calls.copy[0].fileId, 'OVERRIDE');
  assert.equal(r.shared, true);
  assert.equal(calls.permissions[0].requestBody.type, 'user');
  assert.equal(calls.permissions[0].requestBody.role, 'reader');
  assert.equal(calls.permissions[0].requestBody.emailAddress, 'jury@acadenice.fr');
  assert.equal(calls.permissions[0].sendNotificationEmail, false);
});

test('programmatic mode threads GDOC_LOGO_PNG_URL into an insertInlineImage', async () => {
  const { google, calls } = makeGoogle();
  const pub = createPublisher(deps({ cfg: { GDOC_LOGO_PNG_URL: 'https://x/logo.png' }, google }));
  const r = await pub.publish({ title: 'T' });
  assert.equal(r.ok, true);
  assert.equal(r.mode, 'programmatic');
  const reqs = calls.batchUpdate[0].requestBody.requests;
  assert.ok(reqs.some((q) => q.insertInlineImage && q.insertInlineImage.uri === 'https://x/logo.png'));
});

test('an API failure degrades to api-error (never throws)', async () => {
  const { google } = makeGoogle({ failCreate: true });
  const pub = createPublisher(deps({ google }));
  let r;
  await assert.doesNotReject(async () => {
    r = await pub.publish({ title: 'T' });
  });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'api-error');
});

test('auth uses the narrow scopes (documents + drive.file)', async () => {
  const { google, calls } = makeGoogle();
  const pub = createPublisher(deps({ google }));
  await pub.publish({ title: 'T' });
  const scopes = calls.auth[0].scopes;
  assert.ok(scopes.includes('https://www.googleapis.com/auth/documents'));
  assert.ok(scopes.includes('https://www.googleapis.com/auth/drive.file'));
  assert.ok(!scopes.includes('https://www.googleapis.com/auth/drive')); // not the broad scope
});

test('status() reports configuration without throwing', () => {
  const { google } = makeGoogle();
  const pub = createPublisher(deps({ cfg: { GDOC_TEMPLATE_ID: 'TPL' }, google }));
  const s = pub.status();
  assert.equal(s.credentialsConfigured, true);
  assert.equal(s.credentialsValid, true);
  assert.equal(s.clientEmail, 'sa@p.iam.gserviceaccount.com');
  assert.equal(s.templateConfigured, true);
});
