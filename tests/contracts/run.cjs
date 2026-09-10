// Run against a local checkout of the actual Router and its locked dependencies.
// Copy to a temporary directory so the contract repository is never modified.
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const source = process.env.ROUTER_SOURCE
if (!source) throw new Error('Set ROUTER_SOURCE to the sunswap-universal-router checkout')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk-exact-out-'))
for (const entry of ['contracts', 'lib', 'test', 'foundry.toml']) {
  fs.cpSync(path.join(source, entry), path.join(root, entry), { recursive: true })
}
fs.copyFileSync(path.join(__dirname, 'SDKExactOut.t.sol'), path.join(root, 'test', 'SDKExactOut.t.sol'))
fs.copyFileSync(path.join(__dirname, 'SDKProtocols.t.sol'), path.join(root, 'test', 'SDKProtocols.t.sol'))
console.log(`Contract execution workspace: ${root}`)
const result = spawnSync('forge', ['test', '--root', root, '--match-path', 'test/SDK*.t.sol',
  '--match-test', 'test_sdk_', '--code-size-limit', '100000', '--offline', '-vv'], {
  stdio: 'inherit', env: { ...process.env, SDK_ENCODER: path.join(__dirname, 'encode.cjs') },
})
if (result.error) throw result.error
process.exitCode = result.status ?? 1
