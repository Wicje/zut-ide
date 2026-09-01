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