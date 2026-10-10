const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.join(__dirname, '..')
const privacyFile = "src/utils/privacy.ts"
const load = (file, dependencies = {}) => {
  const module = { exports: {} }
  const { outputText } = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  })
  vm.runInNewContext(outputText, {
    module, exports: module.exports, Error, process,
    console: { log() {} },
    require(name) {
      if (!(name in dependencies)) throw new Error('Unexpected dependency: ' + name)
      return dependencies[name]
    },
  }, { filename: file })
  return module.exports
}
const privacy = load(privacyFile)

test('logs redact URLs, credentials, contacts and private paths', () => {
  const raw = 'https://private.invalid/music?token=fixture-token wss://private.invalid/sync Bearer fixture-bearer authCode=fixture-code password="fixture-password" person@example.invalid /Users/example/secret/file /home/example/secret C:\\Users\\example\\secret 192.168.1.21 13800138000'
  const output = privacy.redactLogText(raw)
  for (const value of ['private.invalid', 'fixture-token', 'fixture-bearer', 'fixture-code', 'fixture-password', 'person@example.invalid', '/Users/example', '/home/example', 'C:\\Users\\example', '192.168.1.21', '13800138000']) {
    assert.ok(!output.includes(value), 'Sensitive fixture survived redaction')
  }
})
const activeSource = file => fs.readFileSync(path.join(root, file), 'utf8').split('\n').filter(line => !line.trimStart().startsWith('//')).join('\n')

test('sync authentication and URL parsing do not log credentials or endpoint URLs', () => {
  const auth = activeSource('src/plugins/sync/client/auth.ts')
  const utils = activeSource('src/plugins/sync/client/utils.ts')
  assert.doesNotMatch(auth, /console\.(?:log|error|warn|info|debug)\s*\(/)
  assert.doesNotMatch(utils, /console\.(?:log|info|debug)\s*\(/)
  assert.doesNotMatch(activeSource('src/utils/request.js'), /console\.log\(['"]---start---/ )
})

test('application file logger redacts before console and file output', async() => {
  const writes = []
  const logger = load('src/utils/log.ts', {
    '@/utils/fs': {
      temporaryDirectoryPath: '/tmp', existsFile: async() => true,
      appendFile: async(_path, message) => { writes.push(message) },
      unlink: async() => {}, writeFile: async() => {}, readFile: async() => '',
    },
    './privacy': privacy,
  })
  await logger.init()
  logger.log.error({ authCode: 'fixture-code', nested: { token: 'fixture-token' } })
  assert.equal(writes.length, 1)
  assert.ok(!writes[0].includes('fixture-code'))
  assert.ok(!writes[0].includes('fixture-token'))
})

test('structured log values redact nested authentication and device fields', () => {
  const output = JSON.parse(privacy.formatLogValue({
    count: 2, authCode: 'fixture-code', key: 'fixture-key', privateKey: 'fixture-private-key',
    nested: { token: 'fixture-token', userName: 'fixture-user', deviceName: 'fixture-device', headers: { cookie: 'fixture-cookie' } },
  }))
  assert.equal(output.count, 2)
  assert.equal(output.authCode, '[redacted]')
  assert.equal(output.key, '[redacted]')
  assert.equal(output.privateKey, '[redacted]')
  assert.equal(output.nested.userName, '[redacted]')
  assert.equal(output.nested.deviceName, '[redacted]')
  assert.equal(output.nested.headers, '[redacted]')
})

test('error messages are redacted and circular log objects fail closed', () => {
  const output = privacy.formatLogValue(new Error('fetch https://private.invalid/?token=fixture-token failed'))
  assert.ok(output.includes('Error'))
  assert.ok(!output.includes('private.invalid'))
  const circular = {}
  circular.self = circular
  assert.equal(privacy.formatLogValue(circular), '[unserializable log data]')
})

test('local credentials and private signing files are ignored', () => {
  const ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8')
  for (const pattern of ['.env', '.env.*', '*.jks', '*.p12', '*.pfx', '*.pem', '*.key']) {
    assert.ok(ignore.split('\n').includes(pattern), 'Missing ignore rule: ' + pattern)
  }
})
