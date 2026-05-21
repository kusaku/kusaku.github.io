import http from 'node:http';
import fs from 'node:fs';

const API_BASE = 'https://api.soundcloud.com';
const AUTH_URL = 'https://secure.soundcloud.com/oauth/token';
const API_HOST = 'api.soundcloud.com';

const TOKEN_SKEW_MS = 90_000;

const RETRY_CODES = new Set(['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT']);
const DIRECT_MEDIA_HOSTS = new Set([
  'cf-hls-media.sndcdn.com',
  'cf-media.sndcdn.com',
  'media.sndcdn.com',
  'playback.media-streaming.soundcloud.cloud',
]);

const STREAM_FIELDS = [
  ['hls_aac_160_url', 'hls'],
  ['hls_mp3_128_url', 'hls'],
  ['http_mp3_128_url', 'progressive'],
  ['preview_mp3_128_url', 'progressive'],
];

const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT) || 8787;
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
const tokenCachePath = process.env.TOKEN_CACHE_PATH || '/tmp/soundcloud-api-token.json';
const playlistId = requiredEnv('SOUNDCLOUD_PLAYLIST_ID');
const clientId = requiredEnv('SOUNDCLOUD_CLIENT_ID');
const clientSecret = requiredEnv('SOUNDCLOUD_CLIENT_SECRET');

let tokenCache = readTokenCache();
let tokenRequest;

const corsHeaders = (request, headers = {}) => ({
  'access-control-allow-origin': allowedOrigin,
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type, accept',
  ...headers,
});

const send = (response, request, status, body = '', headers = {}) => {
  response.writeHead(status, corsHeaders(request, headers));
  response.end(body);
};

const sendJson = (response, request, status, body, headers = {}) => send(
  response,
  request,
  status,
  JSON.stringify(body),
  { 'content-type': 'application/json; charset=utf-8', ...headers },
);

const fetchUpstream = async (url, options = {}) => {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt || (!RETRY_CODES.has(error?.code) && !RETRY_CODES.has(error?.cause?.code))) break;
    }
  }
  throw lastError;
};

function readTokenCache() {
  try {
    return JSON.parse(fs.readFileSync(tokenCachePath, 'utf8'));
  } catch (error) {
    console.warn('[SoundCloud] Could not read token cache.', error.message);
  }
}

const writeTokenCache = () => {
  try {
    fs.writeFileSync(tokenCachePath, JSON.stringify(tokenCache), { mode: 0o600 });
  } catch (error) {
    console.warn('[SoundCloud] Could not write token cache.', error.message);
  }
};

const requestToken = async (body, { useBasicAuth = false } = {}) => {
  const headers = {
    accept: 'application/json; charset=utf-8',
    'content-type': 'application/x-www-form-urlencoded',
  };

  if (useBasicAuth) {
    headers.authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
  }

  const response = await fetchUpstream(AUTH_URL, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const error = new Error(`SoundCloud token request failed with ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const token = await response.json();
  if (!token.access_token) throw new Error('SoundCloud token response did not include an access token');

  tokenCache = {
    accessToken: token.access_token,
    expiresAt: Date.now() + (Number(token.expires_in) || 3600) * 1000,
    refreshToken: token.refresh_token,
  };
  writeTokenCache();
  return tokenCache.accessToken;
};

const accessToken = async () => {
  const now = Date.now();
  if (tokenCache?.expiresAt > now + TOKEN_SKEW_MS) return tokenCache.accessToken;
  if (tokenRequest) return tokenRequest;

  tokenRequest = (async () => {
    if (tokenCache?.refreshToken) {
      try {
        return await requestToken(new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: tokenCache.refreshToken,
        }));
      } catch (error) {
        if (![400, 401].includes(error.status)) throw error;
      }
    }

    return requestToken(
      new URLSearchParams({ grant_type: 'client_credentials' }),
      { useBasicAuth: true },
    );
  })();

  try {
    return await tokenRequest;
  } finally {
    tokenRequest = null;
  }
};

const soundCloudJson = async (path) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetchUpstream(`${API_BASE}${path}`, {
      headers: {
        accept: 'application/json; charset=utf-8',
        authorization: `OAuth ${await accessToken()}`,
      },
    });
    const text = await response.text();

    if (!response.ok) throw new Error(`SoundCloud request failed with ${response.status}`);
    if (!text.trim() && response.status === 202 && attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
      continue;
    }
    if (!text.trim()) throw new Error(`SoundCloud request returned an empty ${response.status} response`);

    return JSON.parse(text);
  }
};

const getPlaylistTracks = async () => {
  const data = await soundCloudJson(
    `/playlists/${encodeURIComponent(playlistId)}/tracks?${new URLSearchParams({ linked_partitioning: 'true' })}`,
  );
  const tracks = Array.isArray(data.collection) ? data.collection : [];

  return {
    tracks: tracks.filter((track) => track.id && track.access === 'playable'),
  };
};

const manifestUrl = (requestUrl, targetUrl) => {
  const url = new URL('/proxy', requestUrl.origin);
  url.searchParams.set('url', targetUrl);
  return url.href;
};

const getTrackStream = async (trackId, requestUrl) => {
  const streams = await soundCloudJson(`/tracks/${encodeURIComponent(trackId)}/streams`);
  const field = STREAM_FIELDS.find(([name]) => streams[name]);
  if (!field) throw new Error('No playable SoundCloud stream found');

  const stream = { url: streams[field[0]], protocol: field[1], format: field[0] };
  if (stream.protocol === 'hls') stream.url = manifestUrl(requestUrl, stream.url);
  return stream;
};

const requestUrlFor = (request) => {
  const forwardedProto = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return new URL(request.url, `${forwardedProto || 'http'}://${request.headers.host}`);
};

const rewriteManifest = (manifest, sourceUrl, requestUrl) => {
  const playableUrl = (value) => {
    const url = new URL(value, sourceUrl);
    return url.hostname === API_HOST ? manifestUrl(requestUrl, url.href) : url.href;
  };

  return manifest
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (!trimmed.startsWith('#')) return playableUrl(trimmed);
      return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${playableUrl(uri)}"`);
    })
    .join('\n');
};

const proxyManifest = async (request, response, requestUrl) => {
  const rawUrl = requestUrl.searchParams.get('url');
  if (!rawUrl) {
    send(response, request, 400, 'Missing url');
    return;
  }

  let targetUrl;
  try {
    targetUrl = new URL(rawUrl);
  } catch {
    send(response, request, 400, 'Invalid url');
    return;
  }

  if (DIRECT_MEDIA_HOSTS.has(targetUrl.hostname)) {
    send(response, request, 302, '', {
      'cache-control': 'public, max-age=3600',
      location: targetUrl.href,
    });
    return;
  }
  if (targetUrl.hostname !== API_HOST) return send(response, request, 400, 'Unsupported media host');

  const upstream = await fetchUpstream(targetUrl, {
    headers: {
      accept: 'application/vnd.apple.mpegurl, application/x-mpegURL, */*',
      authorization: `OAuth ${await accessToken()}`,
    },
  });

  if (!upstream.ok) return send(response, request, upstream.status, 'Manifest request failed');

  const contentType = upstream.headers.get('content-type') || '';
  if (!contentType.includes('mpegurl') && !targetUrl.pathname.endsWith('.m3u8')) {
    return send(response, request, 415, 'Proxy only supports HLS manifests');
  }

  return send(response, request, 200, rewriteManifest(await upstream.text(), targetUrl.href, requestUrl), {
    'cache-control': 'private, max-age=15',
    'content-type': 'application/vnd.apple.mpegurl; charset=utf-8',
  });
};

const route = async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, request, 204);
  if (request.method !== 'GET') return sendJson(response, request, 405, { error: 'Method not allowed' });

  const requestUrl = requestUrlFor(request);
  const path = requestUrl.pathname.replace(/\/$/, '') || '/';

  try {
    if (path === '/health') {
      return sendJson(response, request, 200, { status: 'ok' }, { 'cache-control': 'no-store' });
    }
    if (path === '/tracks') {
      return sendJson(response, request, 200, await getPlaylistTracks(), { 'cache-control': 'public, max-age=300' });
    }
    if (path === '/proxy') return proxyManifest(request, response, requestUrl);

    const streamMatch = path.match(/^\/tracks\/([^/]+)\/stream$/);
    if (streamMatch) {
      return sendJson(response, request, 200, await getTrackStream(streamMatch[1], requestUrl), {
        'cache-control': 'private, max-age=30',
      });
    }

    return sendJson(response, request, 404, { error: 'Not found' });
  } catch (error) {
    console.error(error);
    return sendJson(response, request, 502, { error: error.message || 'SoundCloud API request failed' });
  }
};

http.createServer((request, response) => {
  route(request, response).catch((error) => {
    console.error(error);
    sendJson(response, request, 500, { error: 'Internal server error' });
  });
}).listen(port, host, () => {
  console.log(`[SoundCloud] API listening on ${host}:${port}`);
});
