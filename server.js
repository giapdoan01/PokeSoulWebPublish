const express = require('express');
const path = require('path');
const { Readable } = require('stream');

const app = express();
const rootDir = __dirname;
const port = Number(process.env.PORT) || 3000;
const addressablesBaseUrl = 'https://d1akc1kjy769t9.cloudfront.net/addressables/webgl/';

function setPrecompressedHeaders(res, filePath) {
  if (!filePath.endsWith('.br')) {
    return;
  }

  const originalPath = filePath.slice(0, -3);
  res.setHeader('Content-Encoding', 'br');
  res.setHeader('Vary', 'Accept-Encoding');

  if (originalPath.endsWith('.wasm')) {
    res.setHeader('Content-Type', 'application/wasm');
    return;
  }

  if (originalPath.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    return;
  }

  if (originalPath.endsWith('.json')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return;
  }

  res.setHeader('Content-Type', 'application/octet-stream');
}

app.disable('x-powered-by');

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
});

async function proxyBundleRequest(req, res) {
  try {
    const requestPath = req.params.fileName || req.path || req.url || '';
    const upstreamPath = requestPath.replace(/^\/+/, '');
    const upstreamUrl = addressablesBaseUrl + encodeURI(upstreamPath);
    const headers = {};

    if (req.headers.range) {
      headers.Range = req.headers.range;
    }

    const upstreamResponse = await fetch(upstreamUrl, { headers });

    res.status(upstreamResponse.status);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    [
      'accept-ranges',
      'cache-control',
      'content-encoding',
      'content-length',
      'content-range',
      'content-type',
      'etag',
      'last-modified',
    ].forEach((headerName) => {
      const headerValue = upstreamResponse.headers.get(headerName);

      if (headerValue) {
        res.setHeader(headerName, headerValue);
      }
    });

    if (!res.getHeader('content-type')) {
      res.setHeader('Content-Type', 'application/octet-stream');
    }

    if (!upstreamResponse.body) {
      res.end();
      return;
    }

    Readable.fromWeb(upstreamResponse.body).pipe(res);
  } catch (error) {
    console.error('Bundle proxy failed:', error);
    res.status(502).send('Failed to download bundle.');
  }
}

app.use('/addressables/webgl', proxyBundleRequest);
app.get('/addressables-bundles/:fileName', proxyBundleRequest);
app.get('/github-bundles/:fileName', proxyBundleRequest);

app.use(express.static(rootDir, {
  index: false,
  setHeaders: (res, filePath) => {
    setPrecompressedHeaders(res, filePath);

    if (filePath.endsWith('.wasm')) {
      res.setHeader('Content-Type', 'application/wasm');
    }

    if (
      filePath.endsWith('.bundle') ||
      filePath.endsWith('.bin') ||
      filePath.endsWith('.hash')
    ) {
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

app.get('*', (req, res) => {
  res.sendFile(path.join(rootDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`PokeSoul WebGL running at http://localhost:${port}`);
});
