const fs = require('fs');
const path = require('path');
const file = fs.readFileSync('generate.js', 'utf8');
const code = file.replace('main();', '') + `
  const dummyStats = {
    totalStars: 100, publicRepos: 50, followers: 10, contributions: 1000,
    topRepos: [{name: 'repo', stargazers_count: 10, forks_count: 5}],
    topLanguages: [['JavaScript', 1000]]
  };
  const svg = generateSVG(dummyStats);
  fs.writeFileSync('output/test.svg', svg);
`;
fs.writeFileSync('test.js', code);
