import type { FileMap } from '../types'

export const HTML_FILE = 'index.html'
export const CSS_FILE = 'style.css'
export const JS_FILE = 'script.js'
export const TS_FILE = 'script.ts'

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
  <title>React + Router + TanStack</title>
</head>
<body>
  <div id="root"></div>
  <script src="src/main.jsx"></script>
</body>
</html>
`,
    'src/main.jsx': `import React from 'https://esm.sh/react@18.3.1';
import { createRoot } from 'https://esm.sh/react-dom@18.3.1/client';
import { MemoryRouter } from 'https://esm.sh/react-router-dom@6.26.2?external=react,react-dom';
import { QueryClient, QueryClientProvider } from 'https://esm.sh/@tanstack/react-query@5.59.0?external=react,react-dom';
import App from './App.jsx';
import './App.css';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')).render(
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>
      <App />
    </MemoryRouter>
  </QueryClientProvider>,
);
`,
    'src/App.jsx': `import React from 'https://esm.sh/react@18.3.1';
import { Routes, Route, Link, NavLink } from 'https://esm.sh/react-router-dom@6.26.2?external=react,react-dom';
import Home from './pages/Home.jsx';
import About from './pages/About.jsx';

export default function App() {
  return (
    <div className="app">
      <header>
        <strong>Vite + React Router + TanStack Query</strong>
        <nav>
          <NavLink to="/" end>Home</NavLink>
          <NavLink to="/about">About</NavLink>
        </nav>
      </header>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="*" element={<p>Not found. <Link to="/">Go home</Link>.</p>} />
      </Routes>
    </div>
  );
}
`,
    'src/pages/Home.jsx': `import React from 'https://esm.sh/react@18.3.1';
import { useQuery } from 'https://esm.sh/@tanstack/react-query@5.59.0?external=react,react-dom';

async function fetchTodos() {
  await new Promise((r) => setTimeout(r, 600));
  return [
    { id: 1, title: 'Route with React Router' },
    { id: 2, title: 'Fetch data with TanStack Query' },
    { id: 3, title: 'Ship it' },
  ];
}

export default function Home() {
  const { data, isPending, error } = useQuery({ queryKey: ['todos'], queryFn: fetchTodos });

  if (isPending) return <p>Loading…</p>;
  if (error) return <p>Something went wrong.</p>;

  return (
    <section>
      <h1>Home</h1>
      <ul>
        {data.map((t) => <li key={t.id}>{t.title}</li>)}
      </ul>
    </section>
  );
}
`,
    'src/pages/About.jsx': `import React from 'https://esm.sh/react@18.3.1';

export default function About() {
  return (
    <section>
      <h1>About</h1>
      <p>This starter runs entirely in your browser — no build step, no server.</p>
    </section>
  );
}
`,
    'src/App.css': `.app {
  font-family: system-ui, -apple-system, sans-serif;
  max-width: 560px;
  margin: 0 auto;
  padding: 32px 20px;
}

header {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border-bottom: 1px solid #2a2f3a;
  padding-bottom: 14px;
}

header nav { display: flex; gap: 14px; }

header a { color: #7aa2ff; text-decoration: none; font-size: 14px; }

header a.active { font-weight: 600; color: #4f8cff; }

h1 { font-size: 20px; }

ul { line-height: 1.9; padding-left: 20px; }
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
