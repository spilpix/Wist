// Build the standalone "Testing Bard" installer.
//
// It is a fully ISOLATED copy of Bard: a separate appId (com.wist.testing),
// a separate data folder (%APPDATA%/WistTesting) and a separate installer
// (release-testing/), so it can never touch the user's real Bard data. On first
// launch it fills its empty database with demo content across every module.
//
// Usage:  npm run dist:testing
import { execSync } from 'node:child_process'

const env = { ...process.env, BARD_TESTING: '1' }
const run = (cmd) => execSync(cmd, { stdio: 'inherit', env })

console.log('▶ Building Testing Bard (BARD_TESTING=1) …')
run('npm run build')
run('npx electron-builder --config electron-builder-testing.json')
console.log('\n✓ Testing Bard installer written to release-testing/')
