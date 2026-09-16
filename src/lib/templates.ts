import type { FileMap } from '../types'

export const HTML_FILE = 'index.html'
export const CSS_FILE = 'style.css'
export const JS_FILE = 'script.js'
export const TS_FILE = 'script.ts'

function nodeLauncherPage(
  title: string,
  body: string,
): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f1115; color: #e6edf3; line-height: 1.6;
      max-width: 640px; margin: 0 auto; padding: 40px 20px;
    }
    code { background: #1c2128; padding: 2px 6px; border-radius: 5px; font-size: 13px; }
    .tip { border-left: 3px solid #4f8cff; padding-left: 14px; margin-top: 18px; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>This is a <strong>Node server project</strong> — it needs a Node.js runtime, so it can't run
  inside the browser preview.</p>
  ${body}
</body>
</html>
`
}

export function emptyProject(): FileMap {
  return {
    [HTML_FILE]: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hello, World!</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <h1>Hello, World!</h1>
  <p>Edit me and watch the preview update.</p>
  <script src="script.js"></script>
</body>
</html>
`,
    [CSS_FILE]: `body {
  font-family: system-ui, -apple-system, sans-serif;
  background: #f4f4f5;
  color: #16181d;
  display: grid;
  place-content: center;
  min-height: 100vh;
  margin: 0;
}

h1 {
  color: #4f46e5;
}
`,
    [JS_FILE]: `console.log('Hello from script.js!');

const heading = document.querySelector('h1');
heading.addEventListener('click', () => {
  console.log('You clicked the heading!');
  heading.style.color = heading.style.color === 'red' ? '#4f46e5' : 'red';
});
`,
  }
}

export function javascriptStarter(): FileMap {
  const files = emptyProject()
  delete files[CSS_FILE]
  files[HTML_FILE] = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>JavaScript Playground</title>
</head>
<body>
  <h1>JavaScript Playground</h1>
  <p>Open the console to see output.</p>
  <script src="script.js"></script>
</body>
</html>
`
  return files
}

export function typescriptStarter(): FileMap {
  const files = emptyProject()
  delete files[CSS_FILE]
  delete files[JS_FILE]
  files[TS_FILE] = `interface Student {
  name: string;
  grade: number;
}

const students: Student[] = [
  { name: 'Ada', grade: 95 },
  { name: 'Grace', grade: 89 },
];

function bestStudent(list: Student[]): Student {
  return list.reduce((best, s) => (s.grade > best.grade ? s : best));
}

console.log('Best student:', bestStudent(students).name);
`
  files[HTML_FILE] = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>TypeScript Playground</title>
</head>
<body>
  <h1>TypeScript Playground</h1>
  <p>Open the console — console.log output shows here.</p>
  <script src="script.ts"></script>
</body>
</html>
`
  return files
}

// ---------------------------------------------------------------------------
// Framework templates
// ---------------------------------------------------------------------------

export function reactStarter(): FileMap {
  return {
    [HTML_FILE]: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>React starter</title>
</head>
<body>
  <div id="root"></div>
  <script src="src/main.jsx"></script>
</body>
</html>
`,
    'src/main.jsx': `import React from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';
import './App.css';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
`,
    'src/App.jsx': `import React from 'https://esm.sh/react@18.3.1';

export default function App() {
  const [count, setCount] = React.useState(0);

  return (
    <main className="app">
      <h1>React</h1>
      <p>Stateless… well, almost.</p>
      <button onClick={() => setCount((c) => c + 1)}>
        Clicked {count}×
      </button>
    </main>
  );
}
`,
    'src/App.css': `.app {
  font-family: system-ui, -apple-system, sans-serif;
  padding: 40px;
  max-width: 480px;
  margin: 0 auto;
}

.app h1 { color: #4f8cff; }

.app button {
  background: #4f8cff;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 14px;
  cursor: pointer;
}
`,
  }
}

export function vueStarter(): FileMap {
  return {
    [HTML_FILE]: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Vue starter</title>
</head>
<body>
  <div id="app"></div>
  <script src="src/main.js"></script>
</body>
</html>
`,
    'src/main.js': `import { createApp } from 'https://esm.sh/vue@3.5.13';
import App from './App.vue';

createApp(App).mount('#app');
`,
    'src/App.vue': `<script setup>
import { ref } from 'vue';

const title = 'Vue 3';
const count = ref(0);
</script>

<template>
  <main class="app">
    <h1>{{ title }}</h1>
    <p>Reactive and friendly.</p>
    <button @click="count++">Clicked {{ count }}×</button>
  </main>
</template>

<style>
.app {
  font-family: system-ui, -apple-system, sans-serif;
  padding: 40px;
  max-width: 480px;
  margin: 0 auto;
}

.app h1 { color: #42b883; }

.app button {
  background: #42b883;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 10px 16px;
  font-size: 14px;
  cursor: pointer;
}
</style>
`,
  }
}

export function nextStarter(): FileMap {
  return {
    [HTML_FILE]: nodeLauncherPage(
      'Next.js project',
      `<div class="tip">
        <p><strong>Next.js is a React framework with its own server.</strong> The real app lives in
        <code>app/</code> and runs on Vercel (or <code>npm run dev</code> locally) — not in this preview.</p>
        <p>To see it live: use <strong>⬆ Deploy → Vercel</strong> (or push to GitHub and import into
        Vercel). Vercel auto-detects Next.js and builds it for you.</p>
      </div>`,
    ),
    'package.json': `{
  "name": "next-app",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "15.1.6",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  }
}
`,
    'next.config.mjs': `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
`,
    'app/layout.tsx': `import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Next.js starter',
  description: 'Created with zut',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    'app/page.tsx': `export default function Home() {
  return (
    <main style={{ padding: '2.5rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Hello from Next.js</h1>
      <p>Page routes live under <code>app/</code>; try editing this one and redeploying.</p>
      <a href="/about">Go to /about</a>
    </main>
  );
}
`,
    'app/about/page.tsx': `export default function About() {
  return <p style={{ padding: '2.5rem' }}>About page — add more routes the same way.</p>;
}
`,
    'tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"]
}
`,
  }
}

export function expressStarter(): FileMap {
  return {
    [HTML_FILE]: nodeLauncherPage(
      'Express API',
      `<div class="tip">
        <p>An Express REST API lives here. It exposes <code>GET /api/hello</code>.</p>
        <p>Run it in Node with <code>npm install && npm start</code>, then hit
        <code>http://localhost:3000/api/hello</code>.</p>
        <p>To ship it: <strong>⬆ Deploy → GitHub</strong> to create a repo, then host it on
        Render, Railway or Fly with <code>npm start</code>.</p>
      </div>`,
    ),
    'package.json': `{
  "name": "express-api",
  "version": "1.0.0",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js"
  },
  "dependencies": {
    "express": "^4.21.2"
  }
}
`,
    'src/index.js': `const express = require('express');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ name: 'express-api', status: 'ok' });
});

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from Express!', at: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(\`Listening on http://localhost:\${port}\`);
});
`,
  }
}

export function nestStarter(): FileMap {
  return {
    [HTML_FILE]: nodeLauncherPage(
      'NestJS API',
      `<div class="tip">
        <p>A NestJS application lives in <code>src/</code> (modules, controllers, services).</p>
        <p>Run it in Node with <code>npm install && npm run build && npm start</code>, then hit
        <code>http://localhost:3000</code>.</p>
        <p>To ship it: <strong>⬆ Deploy → GitHub</strong>, then build on any Node host.</p>
      </div>`,
    ),
    'package.json': `{
  "name": "nestjs-api",
  "version": "1.0.0",
  "scripts": {
    "build": "nest build",
    "start": "node dist/main",
    "start:dev": "nest start --watch"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.15",
    "@nestjs/core": "^10.4.15",
    "@nestjs/platform-express": "^10.4.15",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.9",
    "typescript": "^5.7.3"
  }
}
`,
    'nest-cli.json': `{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src"
}
`,
    'tsconfig.json': `{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "moduleResolution": "node",
    "skipLibCheck": true,
    "strictNullChecks": false,
    "noImplicitAny": false,
    "outDir": "./dist",
    "baseUrl": "./"
  },
  "include": ["src/**/*"]
}
`,
    'src/main.ts': `import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
  console.log('NestJS API running at http://localhost:3000');
}

void bootstrap();
`,
    'src/app.module.ts': `import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
`,
    'src/app.controller.ts': `import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
`,
    'src/app.service.ts': `import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello from NestJS!';
  }
}
`,
  }
}