#!/usr/bin/env node
'use strict';
const fetch = require('node-fetch');
const fs    = require('fs');
const path  = require('path');

const USERNAME = process.env.GITHUB_USERNAME || 'PedroFnseca';
const TOKEN    = process.env.GITHUB_TOKEN    || '';
const API      = 'https://api.github.com';

const ROLES = [
  'Full Stack Developer',
  'Software Architecture',
  'Embedded Systems',
];

function escapeXML(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function truncate(str, max) {
  const s = String(str ?? '');
  return s.length > max ? s.slice(0, max - 1) + '~' : s;
}

function nbsp(str) {
  return str.replace(/ /g, '\u00A0');
}

function authHeaders() {
  return {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'github-profile-svg-generator',
    ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
  };
}

async function fetchAllRepos() {
  let repos = [], page = 1;
  while (true) {
    const res = await fetch(
      `${API}/users/${USERNAME}/repos?per_page=100&page=${page}&type=owner`,
      { headers: authHeaders() }
    );
    if (!res.ok) break;
    const batch = await res.json();
    if (!Array.isArray(batch) || !batch.length) break;
    repos = repos.concat(batch);
    if (batch.length < 100) break;
    page++;
  }
  return repos;
}

async function fetchContributions() {
  try {
    const res = await fetch(
      `https://github-contributions-api.jogruber.de/v4/${USERNAME}`,
      { headers: { 'User-Agent': 'github-profile-svg-generator' } }
    );
    if (res.ok) {
      const data = await res.json();
      if (data && data.total) {
        return Object.values(data.total).reduce((sum, val) => sum + (typeof val === 'number' ? val : 0), 0);
      }
    }
  } catch (_) {}

  return null;
}

async function fetchLanguageBytes(repos) {
  const targets = repos.filter(r => !r.fork);
  const langBytes = {};
  const BATCH = 8;

  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(repo =>
        fetch(`${API}/repos/${USERNAME}/${repo.name}/languages`, { headers: authHeaders() })
          .then(r => (r.ok ? r.json() : {}))
          .catch(() => ({}))
      )
    );
    results.forEach(langs => {
      Object.entries(langs).forEach(([lang, bytes]) => {
        langBytes[lang] = (langBytes[lang] || 0) + bytes;
      });
    });
  }

  return langBytes;
}

function getAccountUptime(createdAtStr) {
  if (!createdAtStr) return 'N/A';
  const created = new Date(createdAtStr);
  const now = new Date();
  let years = now.getFullYear() - created.getFullYear();
  let months = now.getMonth() - created.getMonth();
  if (months < 0) {
    years--;
    months += 12;
  }
  const yPart = years > 0 ? `${years} year${years > 1 ? 's' : ''}` : '';
  const mPart = months > 0 ? `${months} month${months > 1 ? 's' : ''}` : '';
  if (yPart && mPart) return `${yPart}, ${mPart}`;
  return yPart || mPart || '1 month';
}

async function fetchGitHubStats() {
  console.log(`\n  Fetching data for @${USERNAME} ...\n`);

  const [userRes, repos, contributions] = await Promise.all([
    fetch(`${API}/users/${USERNAME}`, { headers: authHeaders() }).then(r => r.json()),
    fetchAllRepos(),
    fetchContributions(),
  ]);

  if (!userRes.login) {
    throw new Error(`GitHub API bloqueou a requisição ou falhou: ${userRes.message || 'Erro desconhecido'}`);
  }

  const totalStars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);

  const topRepos = repos
    .filter(r => !r.fork)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 3);

  console.log('  Fetching language byte counts ...');
  const langBytes = await fetchLanguageBytes(repos);

  const topLanguages = Object.entries(langBytes)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const location = userRes.location || 'São Paulo - Brazil';
  let website = userRes.blog ? userRes.blog.replace(/^https?:\/\//, '').replace(/\/$/, '') : 'www.pedrofnseca.me';
  if (!website.startsWith('www.')) website = 'www.' + website;
  const uptime = getAccountUptime(userRes.created_at);

  return {
    followers:     userRes.followers    ?? 0,
    publicRepos:   userRes.public_repos ?? repos.length,
    totalStars,
    contributions: contributions ?? '-',
    topRepos,
    topLanguages,
    location,
    website,
    uptime,
  };
}

function buildBar(pct, width) {
  const filled = Math.round((Math.min(pct, 100) / 100) * width);
  return '[' + '#'.repeat(filled) + '-'.repeat(width - filled) + ']';
}

function interpolateStats(stats, p) {
  if (p >= 1) return stats;
  return {
    ...stats,
    totalStars: Math.floor(stats.totalStars * p),
    publicRepos: Math.floor(stats.publicRepos * p),
    followers: Math.floor(stats.followers * p),
    contributions: typeof stats.contributions === 'number' ? Math.floor(stats.contributions * p) : stats.contributions,
    topRepos: stats.topRepos.map(r => ({
      ...r,
      stargazers_count: Math.floor(r.stargazers_count * p),
      forks_count: Math.floor(r.forks_count * p)
    })),
    topLanguages: stats.topLanguages.map(([lang, bytes]) => [lang, Math.floor(bytes * p)])
  };
}

function buildCard(stats) {
  const LEFT_INNER  = 51;
  const RIGHT_INNER = 60;

  function border() {
    return `+${'-'.repeat(LEFT_INNER)}+${'-'.repeat(RIGHT_INNER)}+`;
  }

  function vLen(str) {
    return str.replace(/§[a-z]+§/g, '').length;
  }
  function vPad(str, width) {
    const len = vLen(str);
    return str + ' '.repeat(Math.max(0, width - len));
  }

  function row(left = '', right = '') {
    return `|${vPad(` ${left}`, LEFT_INNER)}|${vPad(` ${right}`, RIGHT_INNER)}|`;
  }

  const ascii = [
    '*************************************************',
    '*************************************************',
    '******************+.     .=**********************',
    '****************+  .:::...  -********************',
    '***************- :-======-:: :*******************',
    '**************+.:---=+++-:::-.-******************',
    '**************+..::-*==+=:::::=******************',
    '***************-:--==-=-=-----+******************',
    '***************=--=+=:::==--==+******************',
    '***************+--==---------=+******************',
    '****************+:-=====---:=+*******************',
    '*****************=::-==---:-+********************',
    '******************:.     ..:=*******************#',
    '******************=-::--:::-=********************',
    '*****************+------::---:=******************',
    '*************=: :-:------:--::   .-+*************',
    '*********-.     ==::--::::-::         .=*********',
    '******=          .--:::::-:.             .+******',
    '*****=              ....                  .+*****',
    '*****.                                     :*****',
    '*****.                                      =****',
    '*****:                                       ****',
    '*****:                                       :***',
    '*****-                    ....                =**',
    '*****=                                        .+*',
    '*****+                                         -*',
    '*****=                                     ..:=**',
    '*************************************************',
  ];

  const NAME = 'pedro@fonseca';
  const SC   = 14;

  const BAR_W      = 28;
  const LANG_W     = 14;
  const totalBytes = stats.topLanguages.reduce((s, [, b]) => s + b, 0);

  const langLines = stats.topLanguages.map(([lang, bytes]) => {
    const pct    = totalBytes > 0 ? (bytes / totalBytes) * 100 : 0;
    const pctStr = `${Math.round(pct)}%`.padStart(4);
    
    const filled = Math.round((Math.min(pct, 100) / 100) * BAR_W);
    const bar = `[§green§${'#'.repeat(filled)}§reset§§gray§${'-'.repeat(BAR_W - filled)}§reset§]`;
    
    const name   = truncate(lang, LANG_W);
    const paddedName = vPad(name, LANG_W);
    return `§cyan§${paddedName}§reset§ ${bar} §green§${pctStr}§reset§`;
  });

  const right = [
    `§green§${NAME}§reset§`,
    '-'.repeat(NAME.length),
    `§cyan§${ROLES[0]}§reset§`,
    `§cyan§${ROLES[1]}§reset§`,
    `§cyan§${ROLES[2]}§reset§`,
    '',
    `§gray§Location: §reset§§yellow§${stats.location}§reset§`,
    `§gray§Website:  §reset§§blue§${stats.website}§reset§`,
    `§gray§Uptime:   §reset§§green§${stats.uptime}§reset§`,
    '',
    `§magenta§GITHUB§reset§`,
    `§gray§${vPad('Stars', SC)}${vPad('Repos', SC)}${vPad('Followers', SC)}Activity§reset§`,
    `§yellow§${vPad(String(stats.totalStars), SC)}${vPad(String(stats.publicRepos), SC)}${vPad(String(stats.followers), SC)}§reset§§green§${stats.contributions}§reset§`,
    '',
    `§magenta§TOP REPOSITORIES§reset§`,
    ...stats.topRepos.map((repo, i) => {
      const num  = `§gray§0${i + 1}§reset§`;
      const name = `§blue§${vPad(truncate(repo.name, 30), 31)}§reset§`;
      const star = `§yellow§* ${repo.stargazers_count}§reset§`;
      const paddedStar = vPad(star, 8);
      const fork = `§gray§f ${repo.forks_count}§reset§`;
      return `${num}  ${name}${paddedStar}${fork}`;
    }),
    '',
    `§magenta§LANGUAGES§reset§`,
    ...langLines,
    '',
    `§green§@PedroFnseca§reset§§gray§:~$§reset§ █`
  ];

  const maxRows = Math.max(ascii.length, right.length);
  const B = border();
  return [
    B,
    ...Array.from({ length: maxRows }, (_, i) => row(ascii[i] || '', right[i] || '')),
    B,
  ];
}

function generateSVG(stats) {
  const FONT_SIZE = 16;
  const LINE_H    = 20;
  const PAD_X     = 16;
  const PAD_Y     = 15;
  
  const FRAMES = 35;
  const DUR    = 4.0;
  let framesCSS = '';
  let allFramesXML = '';

  for (let i = 0; i < FRAMES; i++) {
    const p = i === FRAMES - 1 ? 1 : i / (FRAMES - 1);
    const iStats = interpolateStats(stats, p);
    const lines = buildCard(iStats);

    if (i === FRAMES - 1) {
      const startPct = ((i / FRAMES) * 100).toFixed(2);
      framesCSS += `
    .frame-${i} { opacity: 0; animation: show-${i} ${DUR}s forwards; }
    @keyframes show-${i} { 0%, ${startPct - 0.01}% { opacity: 0; } ${startPct}%, 100% { opacity: 1; } }`;
    } else {
      const startPct = ((i / FRAMES) * 100).toFixed(2);
      const endPct   = (((i + 1) / FRAMES) * 100).toFixed(2);
      if (i === 0) {
        framesCSS += `
    .frame-${i} { animation: show-${i} ${DUR}s forwards; }
    @keyframes show-${i} { 0%, ${endPct - 0.01}% { opacity: 1; } ${endPct}%, 100% { opacity: 0; } }`;
      } else {
        framesCSS += `
    .frame-${i} { opacity: 0; animation: show-${i} ${DUR}s forwards; }
    @keyframes show-${i} { 0%, ${startPct - 0.01}% { opacity: 0; } ${startPct}%, ${endPct - 0.01}% { opacity: 1; } ${endPct}%, 100% { opacity: 0; } }`;
      }
    }

    const textElements = lines
      .map((line, j) => {
        const y = PAD_Y + (j + 1) * LINE_H;
        let escaped = escapeXML(nbsp(line)).replace('█', '<tspan class="cursor">&#9608;</tspan>');
        escaped = escaped
          .replace(/§red§/g, '<tspan fill="#ff7b72">')
          .replace(/§green§/g, '<tspan fill="#3fb950">')
          .replace(/§blue§/g, '<tspan fill="#58a6ff">')
          .replace(/§cyan§/g, '<tspan fill="#39c5cf">')
          .replace(/§yellow§/g, '<tspan fill="#e3b341">')
          .replace(/§magenta§/g, '<tspan fill="#d2a8ff">')
          .replace(/§gray§/g, '<tspan fill="#8b949e">')
          .replace(/§reset§/g, '</tspan>');
        return `    <text x="${PAD_X}" y="${y}">${escaped}</text>`;
      })
      .join('\n');
      
    allFramesXML += `  <g class="frame-${i}">\n${textElements}\n  </g>\n`;
  }

  const finalLines = buildCard(stats);
  const contentH = finalLines.length * LINE_H + PAD_Y * 2;
  const maxLen = Math.max(...finalLines.map(l => l.replace(/§[a-z]+§/g, '').length));
  const contentW = Math.ceil(maxLen * FONT_SIZE * 0.605) + PAD_X * 2;

  const TARGET_W = 1200;
  const TARGET_H = 720;
  const offsetX  = Math.max(0, Math.floor((TARGET_W - contentW) / 2));
  const offsetY  = Math.max(0, Math.floor((TARGET_H - contentH) / 2));

  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg
    width="${TARGET_W}" height="${TARGET_H}"
    viewBox="0 0 ${TARGET_W} ${TARGET_H}"
    xmlns="http://www.w3.org/2000/svg"
  >
  <defs>
    <clipPath id="wipe">
      <rect x="0" y="0" width="${TARGET_W}" height="${TARGET_H}">
        <animate attributeName="height" from="0" to="${TARGET_H}" dur="2s" fill="freeze" />
      </rect>
    </clipPath>
  </defs>
  <style>
    text {
      font-family: 'Courier New', Consolas, 'Liberation Mono', monospace;
      font-size: ${FONT_SIZE}px;
      fill: #c9d1d9;
    }
    rect { fill: #0d1117; }
    
    @keyframes blink {
      0%, 49% { opacity: 1; }
      50%, 100% { opacity: 0; }
    }
    .cursor { animation: blink 0.7s infinite; }
${framesCSS}
  </style>

  <rect width="${TARGET_W}" height="${TARGET_H}"/>

  <g transform="translate(${offsetX}, ${offsetY})" clip-path="url(#wipe)">
${allFramesXML}
  </g>

  </svg>
`;
}

async function main() {
  try {
    const stats = await fetchGitHubStats();

    console.log(`  Stars         : ${stats.totalStars}`);
    console.log(`  Repos         : ${stats.publicRepos}`);
    console.log(`  Followers     : ${stats.followers}`);
    console.log(`  Contributions : ${stats.contributions}`);
    console.log(`  Top repos     : ${stats.topRepos.map(r => r.name).join(', ')}`);
    console.log(`  Languages     : ${stats.topLanguages.map(([l, b]) => `${l}(${b})`).join(', ')}`);

    const svg     = generateSVG(stats);
    const outDir  = path.join(__dirname, 'output');
    const outFile = path.join(outDir, 'profile.svg');

    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outFile, svg, 'utf8');

    console.log(`\n  SVG saved -> ${outFile}\n`);
  } catch (err) {
    console.error('  Error:', err.message);
    process.exit(1);
  }
}

main();
