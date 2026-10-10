/**
 * Read a bundled asset into an ArrayBuffer.
 *
 * fetch() refuses file:// URLs in the packaged app, so a failed fetch falls
 * back to XMLHttpRequest, which reads them fine (status 0 on success there).
 */
export function getBuffer(url) {
  return fetch(url).then(
    (r) => { if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`); return r.arrayBuffer(); },
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
