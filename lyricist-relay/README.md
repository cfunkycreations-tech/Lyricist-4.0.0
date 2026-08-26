# Lyricist Kaggle relay

A CORS shim so **One Man Band works on a phone**. Nothing more.

A browser cannot call Kaggle's API directly: the request is cross-origin and
Kaggle sends no CORS headers, so it dies before it leaves the device. This
worker sits in the middle and forwards the call.

## It holds no secrets

**The user's own Kaggle token rides through in the `Authorization` header** and
is never read, logged or stored. Same as the desktop app has always worked:
everyone brings their own free Kaggle account, nobody's renders run on Chris's
30 weekly GPU hours.

Read the comment at the top of `src/index.js` before adding a secret. The
temptation will come; the reasons not to are written down there.

## What it allows, and nothing else

| Route | Purpose |
|---|---|
| `POST /api/kernels.KernelsApiService/SaveKernel` | push the notebook |
| `POST /api/kernels.KernelsApiService/GetKernelSessionStatus` | poll it |
| `POST /api/kernels.KernelsApiService/ListKernelSessionOutput` | find the song |
| `POST /api/security.OAuthService/IntrospectToken` | check a pasted token |
| `GET /file?url=...` | stream the finished song back, Kaggle hosts only |
| `GET /health` | is it up |

Any other service, method, host or origin is refused. That keeps it from
becoming an open proxy running on Chris's request quota.

## LIVE

```
https://lyricist-kaggle-relay.cfunkycreations.workers.dev
```

Deployed 2026-08-24 to Chris's Cloudflare account. That is the URL the mobile
app points at.

## Deploy

```
npm install
npx wrangler login          # opens the browser, once
npm run deploy
```

Watch it live:

```
npm run tail
```

## Free tier, checked 2026-08-24

100,000 requests a day, 10ms CPU per request, 50 external subrequests per call.
Waiting on a fetch does not count toward CPU time, so a proxy fits the free plan
comfortably. At a 20 second status poll a full song costs roughly 270 requests,
so about 250 songs a day. **Poll slowly on mobile** - there is no reason to ask
every 5 seconds about a job that takes 90 minutes.

## Tests

```
node --input-type=module -e "..."   # see the guard tests in the session notes
```

Every guard was verified before first deploy AND again against the live worker:
bad origin, missing token, non-allowlisted method and service, wrong HTTP verb,
non-Kaggle file host, plain http, missing url, unknown route. A lookalike host
(`evilkaggleusercontent.com`) is refused too - the check is exact match or a
real subdomain, never `endsWith` on the bare string.

## PROVEN END TO END, 2026-08-24

Not "the guards pass". A real song came back through it:

1. `IntrospectToken` with his real `KGAT_` code -> 200, `active: true`,
   `username: christopherfunk72`.
2. `GetKernelSessionStatus` -> `COMPLETE`.
3. `ListKernelSessionOutput` -> two takes.
4. `GET /file?url=...` -> **13,359,403 bytes**, verified by ffprobe as real
   audio: FLAC, 2:02, 44.1 kHz stereo, mean -14.0 dB, max -3.7 dB.

**The bug that only an end-to-end test could find:** the first deploy's file-host
allowlist did not include `kaggleusercontent.com`, and that is where Kaggle
actually serves finished songs from - signed `https://www.kaggleusercontent.com/kf/...`
urls, not `kaggle.com` ones. Every download would have been refused by our own
guard with a 403. The guard tests all passed while the feature was broken. Fixed
and redeployed.
