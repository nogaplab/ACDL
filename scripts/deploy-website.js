#!/usr/bin/env node
/**
 * Deploy script for copying the built website to the acdl-website repository.
 *
 * This script:
 * 1. Builds the website (runs build-website.js)
 * 2. Copies dist/website/* to ../acdl-website/
 * 3. Commits and pushes changes to the website repo
 *
 * Usage: node scripts/deploy-website.js [--no-push]
 *
 * Options:
 *   --no-push    Build and copy files but don't commit/push
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distWebsite = path.join(rootDir, 'dist', 'website');
const deployRepo = path.resolve(rootDir, '..', 'acdl-website');

const noPush = process.argv.includes('--no-push');

function run(cmd, options = {}) {
  console.log(`> ${cmd}`);
  try {
    execSync(cmd, { stdio: 'inherit', ...options });
  } catch (err) {
    if (!options.ignoreError) {
      throw err;
    }
  }
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

async function deploy() {
  console.log('=== ACDL Website Deployment ===\n');

  // Check if deploy repo exists
  if (!fs.existsSync(deployRepo)) {
    console.error(`Error: Deploy repository not found at ${deployRepo}`);
    console.error('Please create it first or adjust the path.');
    process.exit(1);
  }

  // Step 1: Build the website
  console.log('Step 1: Building website...\n');
  run('node scripts/build-website.js', { cwd: rootDir });

  // Step 2: Clear old files (except .git and README.md)
  console.log('\nStep 2: Clearing old files in deploy repo...');
  const filesToKeep = ['.git', 'README.md', '.gitignore', 'CNAME'];
  for (const file of fs.readdirSync(deployRepo)) {
    if (!filesToKeep.includes(file)) {
      const filePath = path.join(deployRepo, file);
      fs.rmSync(filePath, { recursive: true });
      console.log(`  Removed: ${file}`);
    }
  }

  // Step 3: Copy new files
  console.log('\nStep 3: Copying built files...');
  for (const file of fs.readdirSync(distWebsite)) {
    const src = path.join(distWebsite, file);
    const dest = path.join(deployRepo, file);
    copyRecursive(src, dest);
    console.log(`  Copied: ${file}`);
  }

  if (noPush) {
    console.log('\n--no-push specified. Files copied but not committed.');
    console.log(`\nDeploy repo location: ${deployRepo}`);
    return;
  }

  // Step 4: Commit and push
  console.log('\nStep 4: Committing changes...');
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  run('git add -A', { cwd: deployRepo });

  // Check if there are changes to commit
  try {
    execSync('git diff --staged --quiet', { cwd: deployRepo });
    console.log('No changes to commit.');
  } catch {
    // There are changes
    run(`git commit -m "Deploy website - ${timestamp}"`, { cwd: deployRepo });

    console.log('\nStep 5: Pushing to remote...');
    try {
      run('git push', { cwd: deployRepo });
      console.log('\nDeployment complete!');
    } catch {
      console.log('\nCommit created but push failed (remote may not be configured).');
      console.log('To push manually: cd ../acdl-website && git push');
    }
  }

  console.log(`\nDeploy repo location: ${deployRepo}`);
}

deploy().catch(err => {
  console.error('Deployment failed:', err);
  process.exit(1);
});
