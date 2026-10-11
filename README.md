# 5x1 Store

The primary storefront for BEam. To add a theme or skill, open a pull request
containing its repository or manifest URL in `manifest.json`.

The repository also contains a buildless static storefront. Serve this directory
with any static host (including GitHub Pages); `index.html` reads the adjacent
`manifest.json` at runtime. The page uses the BEacon Store's cards, banners,
Themes/Skills switch, fonts and README details, without robot controls or
installation buttons. Both categories display the entries listed in the manifest.

For a local preview:

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080`. An HTTP server is needed for manifest fetching;
opening `index.html` directly as a local file is not supported.

## Catalog formats

Both BEacon's alternating entries and object entries work:

```json
{
  "themes": ["Astra", { "url": "https://github.com/ZaneThePython/Astra" }],
  "skills": [{ "name": "Example", "url": "https://github.com/owner/skill" }]
}
```

`"None", { "url": "." }` displays the built-in stock appearance without a
network request. GitHub repositories load `manifest.json`, `README.md` and
`banner.png` from their default branch using GitHub's raw `HEAD` URLs, avoiding
GitHub API rate limits. Skills without `manifest.json` can use `package.json`.
Other entries may point at a manifest URL or directory; their host must permit
browser CORS requests. HTTPS hosting requires HTTPS asset URLs.

Cards show the first non-heading README paragraph and an optional banner.
Details safely render Markdown and README images; relative images resolve
beside the README. Missing banners use a fallback. Details close with Close,
Escape, or a backdrop click and keep keyboard focus inside while open.

The page refreshes every one hour while visible. Metadata failures show a
Retry button; cached entries remain available when the catalog cannot refresh.
Cards show the GitHub developer and star count. Stars are cached for an hour
to reduce anonymous GitHub API requests; unavailable counts display `—`.
The Skills page includes the official-store review and malware notice.
Browser storage is optional. Colors follow the viewing device's bright/dark
preference, matching BEacon's System appearance.

## Verification

Browser regressions use Playwright as a development dependency only:

```sh
npm install
npx playwright install chromium
npm test
```

The static page has no runtime dependencies or build step. BEacon font assets
and the Google Material cancel icon are bundled locally; asset provenance is
recorded in `assets/NOTICE.txt`.
