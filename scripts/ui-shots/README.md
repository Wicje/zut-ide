# ui-shots — replayable screenshot guide

The set the designer saw (34 states of gate, auth, IDE, agent turn, deploy)
was captured with these two chromium runs against the live dev server and a
static serve of `dist/`:

    npm run build:vercel
    python3 -m http.server 8812 --bind 127.0.0.1 --directory dist &
    cd shot-dir && npm i puppeteer-core
    node states-1.mjs && node states-2.mjs

`ZUT_SHOTS=/some/dir` redirects the output. Requires the local stack up
(`zut`) and `/usr/bin/chromium`. Files overwrite numbers — renumber before a
fresh run if you keep old sets.
