import http from 'node:http';

const API_BASE = 'https://api.soundcloud.com';
const AUTH_URL = 'https://secure.soundcloud.com/oauth/token';
const API_HOST = 'api.soundcloud.com';
const PORT = Number(process.env.PORT) || 8787;
const TOKEN_SKEW_MS = 90_000;
const MAX_TRACK_PAGES = 10;
const RETRY_CODES = new Set(['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT']);
const DIRECT_MEDIA_HOSTS = new Set([
  'cf-hls-media.sndcdn.com',
  'cf-media.sndcdn.com',
  'media.sndcdn.com',
  'playback.media-streaming.soundcloud.cloud',
]);
const STREAM_FIELDS = [
  ['hls_aac_160_url', 'hls'],
  ['hls_aac_96_url', 'hls'],
  ['hls_mp3_128_url', 'hls'],
  ['hls_opus_64_url', 'hls'],
  ['http_mp3_128_url', 'progressive'],
  ['preview_mp3_128_url', 'progressive'],
];

let tokenCache;

const env = (name, fallback = '') => process.env[name] || fallback;
const requiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const allowedOrigins = env('ALLOWED_ORIGIN', '*')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsHeaders = (request, headers = {}) => ({
  'access-control-allow-origin': allowedOrigins.includes('*')
    ? '*'
    : allowedOrigins.includes(request.headers.origin) ? request.headers.origin : 'null',
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

const isRetryable = (error) => RETRY_CODES.has(error?.code) || RETRY_CODES.has(error?.cause?.code);

const fetchUpstream = async (url, options = {}) => {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(url, options);
    } catch (error) {
      lastError = error;
      if (attempt || !isRetryable(error)) break;
    }
  }
  throw lastError;
};

const accessToken = async () => {
  const now = Date.now();
  if (tokenCache?.expiresAt > now + TOKEN_SKEW_MS) return tokenCache.value;

  const credentials = Buffer.from(
    `${requiredEnv('SOUNDCLOUD_CLIENT_ID')}:${requiredEnv('SOUNDCLOUD_CLIENT_SECRET')}`,
  ).toString('base64');
  const response = await fetchUpstream(AUTH_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json; charset=utf-8',
      authorization: `Basic ${credentials}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }),
  });

  if (!response.ok) throw new Error(`SoundCloud token request failed with ${response.status}`);

  const token = await response.json();
  tokenCache = {
    value: token.access_token,
    expiresAt: now + (Number(token.expires_in) || 3600) * 1000,
  };
  return tokenCache.value;
};

const soundCloudJson = async (pathOrUrl) => {
  const response = await fetchUpstream(pathOrUrl.startsWith('https://') ? pathOrUrl : `${API_BASE}${pathOrUrl}`, {
    headers: {
      accept: 'application/json; charset=utf-8',
      authorization: `OAuth ${await accessToken()}`,
    },
  });

  if (!response.ok) throw new Error(`SoundCloud request failed with ${response.status}`);
  return response.json();
};

const normalizeTrack = ({
  id,
  title,
  created_at,
  duration,
  artwork_url,
  metadata_artist,
  permalink_url,
  release,
  release_day,
  release_month,
  release_year,
  user,
}) => ({
  id,
  title,
  created_at,
  duration,
  artwork_url,
  metadata_artist,
  permalink_url,
  release,
  release_day,
  release_month,
  release_year,
  user: user && {
    username: user.username,
    permalink_url: user.permalink_url,
    avatar_url: user.avatar_url,
  },
});

const getTracks = async (requestUrl) => {
  const userId = requestUrl.searchParams.get('user_id') || env('SOUNDCLOUD_USER_ID');
  if (!userId) return { tracks: [] };

  const tracks = [];
  let nextUrl = `${API_BASE}/users/${encodeURIComponent(userId)}/tracks?linked_partitioning=true&limit=200&access=playable`;

  for (let page = 0; nextUrl && page < MAX_TRACK_PAGES; page += 1) {
    const data = await soundCloudJson(nextUrl);
    const collection = Array.isArray(data) ? data : data.collection || [];
    tracks.push(...collection.filter((track) => track.id).map(normalizeTrack));
    nextUrl = Array.isArray(data) ? null : data.next_href || null;
  }

  return { tracks };
};

const manifestUrl = (requestUrl, targetUrl) => {
  const url = new URL('/api/soundcloud/proxy', requestUrl.origin);
  url.searchParams.set('url', targetUrl);
  return url.href;
};

const pickStream = (streams) => {
  const field = STREAM_FIELDS.find(([name]) => streams[name]);
  if (field) return { url: streams[field[0]], protocol: field[1], format: field[0] };
  if (!streams.url) return null;
  return {
    url: streams.url,
    protocol: streams.url.includes('.m3u8') ? 'hls' : 'progressive',
    format: streams.mime_type || 'unknown',
  };
};

const getTrackStream = async (trackId, requestUrl) => {
  let streams;
  try {
    streams = await soundCloudJson(`/tracks/${encodeURIComponent(trackId)}/streams`);
  } catch {
    streams = await soundCloudJson(`/tracks/${encodeURIComponent(trackId)}/stream`);
  }

  const stream = pickStream(streams);
  if (!stream) throw new Error('No playable SoundCloud stream found');
  if (stream.protocol === 'hls') stream.url = manifestUrl(requestUrl, stream.url);
  return stream;
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

const targetUrlFrom = (request, response, requestUrl) => {
  const rawUrl = requestUrl.searchParams.get('url');
  if (!rawUrl) {
    send(response, request, 400, 'Missing url');
    return null;
  }

  try {
    return new URL(rawUrl);
  } catch {
    send(response, request, 400, 'Invalid url');
    return null;
  }
};

const proxyManifest = async (request, response, requestUrl) => {
  const targetUrl = targetUrlFrom(request, response, requestUrl);
  if (!targetUrl) return;

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

const requestUrlFor = (request) => {
  const forwardedProto = String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  return new URL(request.url, `${forwardedProto || 'http'}://${request.headers.host}`);
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
    if (path === '/api/soundcloud/tracks') {
      return sendJson(response, request, 200, await getTracks(requestUrl), { 'cache-control': 'public, max-age=300' });
    }
    if (path === '/api/soundcloud/proxy') return proxyManifest(request, response, requestUrl);

    const streamMatch = path.match(/^\/api\/soundcloud\/tracks\/([^/]+)\/stream$/);
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
}).listen(PORT, '127.0.0.1', () => {
  console.log(`SoundCloud API listening on 127.0.0.1:${PORT}`);
});
