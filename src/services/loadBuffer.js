/**
 * Read a bundled asset into an ArrayBuffer.
 *
 * fetch() refuses file:// URLs in the packaged app, so a failed fetch falls
 * back to XMLHttpRequest, which reads them fine (status 0 on success there).
 *
 * The phone build cannot host a file over 25 MiB, so scripts/build-web.mjs cuts
 * the big soundfont into parts and leaves <file>.parts.json beside them. When
 * the whole file is not there, the parts are fetched and glued back together.
 */
export async function getBuffer(url) {
  try {
    return await getWhole(url);
  } catch (err) {
    const glued = await getParts(url).catch(() => null);
    if (glued) return glued;
    throw err;
  }
}

function getWhole(url) {
  return fetch(url).then(
    (r) => {
      if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
      // A host with no 404 page (Cloudflare Pages) answers a missing file with
      // index.html and a 200. That is not the file.
      if (/^text\/html/i.test(r.headers.get('content-type') || '') && !/\.html?$/i.test(url)) {
        throw new Error(`Could not load ${url} (not on the server)`);
      }
      return r.arrayBuffer();
    },
    () => new Promise((resolve, reject) => {
      const x = new XMLHttpRequest();
      x.open('GET', url);
      x.responseType = 'arraybuffer';
      x.onload = () => ((x.status === 200 || x.status === 0) && x.response && x.response.byteLength ? resolve(x.response) : reject(new Error(`Could not load ${url} (${x.status})`)));
      x.onerror = () => reject(new Error(`Could not load ${url}`));
      x.send();
    }),
  );
}

async function getParts(url) {
  const r = await fetch(`${url}.parts.json`);
  if (!r.ok) return null;
  const { size, parts } = await r.json();
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  const bufs = await Promise.all(parts.map((p) => getWhole(base + p)));
  const out = new Uint8Array(size);
  let at = 0;
  for (const b of bufs) { out.set(new Uint8Array(b), at); at += b.byteLength; }
  if (at !== size) throw new Error(`${url}: parts came to ${at} bytes, expected ${size}`);
  return out.buffer;
}
