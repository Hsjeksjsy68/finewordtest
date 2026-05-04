import fs from 'fs';

let content = fs.readFileSync('src/App.tsx', 'utf-8');

const replacements = [
  { p: /bg-black/g, r: 'bg-white dark:bg-black' },
  { p: /bg-zinc-950/g, r: 'bg-zinc-50 dark:bg-zinc-950' },
  { p: /bg-zinc-900/g, r: 'bg-zinc-100 dark:bg-zinc-900' },
  { p: /bg-zinc-800/g, r: 'bg-zinc-200 dark:bg-zinc-800' },
  { p: /bg-zinc-700/g, r: 'bg-zinc-300 dark:bg-zinc-700' },
  { p: /border-zinc-800/g, r: 'border-zinc-200 dark:border-zinc-800' },
  { p: /border-zinc-900/g, r: 'border-zinc-200 dark:border-zinc-900' },
  { p: /text-white/g, r: 'text-black dark:text-white' },
  { p: /text-zinc-100/g, r: 'text-zinc-900 dark:text-zinc-100' },
  { p: /text-zinc-200/g, r: 'text-zinc-800 dark:text-zinc-200' },
  { p: /text-zinc-300/g, r: 'text-zinc-700 dark:text-zinc-300' },
  { p: /text-zinc-400/g, r: 'text-zinc-500 dark:text-zinc-400' },
  { p: /text-zinc-500/g, r: 'text-zinc-500 dark:text-zinc-500' },
  { p: /hover:text-white/g, r: 'hover:text-black dark:hover:text-white' },
  { p: /hover:text-zinc-300/g, r: 'hover:text-zinc-700 dark:hover:text-zinc-300' },
  { p: /hover:bg-zinc-800/g, r: 'hover:bg-zinc-200 dark:hover:bg-zinc-800' },
  { p: /hover:bg-zinc-900/g, r: 'hover:bg-zinc-100 dark:hover:bg-zinc-900' },
];

for (const { p, r } of replacements) {
  content = content.replace(p, r);
}

fs.writeFileSync('src/App.tsx', content);
console.log('Replacements done!');
