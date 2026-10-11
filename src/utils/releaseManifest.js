// Public manifests avoid the unauthenticated GitHub API rate limit.
export const getReleaseInfo = async(httpGet, urls, includePreview, compareVer, assetFilter) => {
  for (const url of urls) {
    try {
      const manifest = await new Promise((resolve, reject) => {
        httpGet(`${url}?t=${Math.floor(Date.now() / 300000)}`, {
          timeout: 6000,
          open_timeout: 6000,
          read_timeout: 6000,
        }, (error, response, body) => {
          if (error || response?.statusCode !== 200) {
            reject(new Error('UPDATE_INFO_REQUEST_FAILED'))
            return
          }
          try {
            resolve(typeof body === 'string' ? JSON.parse(body) : body)
          } catch {
            reject(new Error('UPDATE_INFO_INVALID_JSON'))
          }
        })
      })
      if (manifest?.schemaVersion !== 1) throw new Error('UPDATE_INFO_INVALID_SCHEMA')
      const validate = release => {
        if (!release) return null
        if (typeof release.version !== 'string' || !/^\d+\.\d+\.\d+$/.test(release.version) || release.version === '0.0.0') throw new Error('UPDATE_INFO_INVALID_VERSION')
        return release
      }
      const stable = validate(manifest.stable)
      const preview = includePreview ? validate(manifest.preview) : null
      const release = preview && (!stable || compareVer(stable.version, preview.version) < 0) ? preview : stable
      if (!release) throw new Error('UPDATE_INFO_NO_RELEASE')
      let assets = release.assets
      if (assetFilter) {
        assets = Array.isArray(assets) ? assets.filter(assetFilter) : []
        if (!assets.length) throw new Error('UPDATE_INFO_NO_ASSET')
      }
      return {
        version: release.version,
        desc: typeof release.desc === 'string' ? release.desc : typeof release.body === 'string' ? release.body : '',
        history: [],
        assets,
        releaseUrl: release.releaseUrl,
        manualDownload: release === preview,
      }
    } catch {
      // An HTTP 200 response may still contain stale/invalid CDN data. Try the next endpoint.
    }
  }
  throw new Error('UPDATE_INFO_UNAVAILABLE')
}
