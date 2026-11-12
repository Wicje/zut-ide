import { describe, expect, it } from 'vitest';
import { buildSrcdoc, collectReferences, injectConsoleHarness, CONSOLE_SOURCE } from './preview';

describe('injectConsoleHarness', () => {
  it('posts console messages under the zut-console source', () => {
    const harness = injectConsoleHarness();
    expect(harness).toContain(`var source = ${JSON.stringify(CONSOLE_SOURCE)};`);
    expect(harness).toContain(`post('console'`);
  });

  it('wraps fetch so network requests are reported', () => {
    const harness = injectConsoleHarness();
    expect(harness).toContain('window.fetch = function');
    expect(harness).toContain(`post('network'`);
  });

  it('wraps XMLHttpRequest open/send so network requests are reported', () => {
    const harness = injectConsoleHarness();
    expect(harness).toContain('XMLHttpRequest.prototype.open');
    expect(harness).toContain('loadend');
  });
});

describe('buildSrcdoc', () => {
  const html = '<!doctype html><html><head><title>t</title></head><body><h1>hi</h1></body></html>';

  it('injects the console harness into <head>', () => {
    const out = buildSrcdoc(html, null);
    expect(out).toContain('var source = ');
    expect(out.indexOf('var source =')).toBeLessThan(out.indexOf('</head>'));
  });

  it('inlines bundle css into <head> and js before </body>', () => {
    const out = buildSrcdoc(html, { js: 'console.log(1);', css: 'h1 { color: red; }' });
    expect(out).toContain('<style data-zut-bundle="">h1 { color: red; }</style>');
    expect(out).toContain('<script type="module" data-zut-bundle="">console.log(1);</script>');
    expect(out.indexOf('data-zut-bundle="">console.log')).toBeLessThan(out.indexOf('</body>'));
  });
});

describe('collectReferences', () => {
  it('collects local stylesheet and script refs, skipping CDN urls', () => {
    const html = `
      <link rel="stylesheet" href="style.css">
      <link rel="stylesheet" href="https://cdn.example.com/x.css">
      <script src="app.js"></script>
      <script src="https://esm.sh/react"></script>
    `;
    expect(collectReferences(html)).toEqual(['style.css', 'app.js']);
  });
});
