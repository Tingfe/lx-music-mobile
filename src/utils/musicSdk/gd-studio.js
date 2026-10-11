// GD音乐台(music.gdstudio.xyz). API terms: https://music-api.gdstudio.xyz/api.php
// Optional online-playback adapter; does not fetch or store audio files.
export const GD_SOURCE_ID = 'gd_studio'
export const GD_SOURCE_NAME = 'GD音乐台（网易云·在线播放）'
export const GD_QUALITYS = ['128k', '320k', 'flac']
const ENDPOINT = 'https://music-api.gdstudio.xyz/api.php'
const WINDOW_MS = 5 * 60 * 1000
const CACHE_MS = 2 * 60 * 1000

export const assertDownloadAllowed = (sourceId) => {
  if (sourceId === GD_SOURCE_ID) throw new Error('GD音乐台当前禁止下载，请切换到允许下载的音源')
}

export const createGdStudioApi = (request, isActive, now = Date.now) => {
  const cache = new Map()
  let requests = []
  return {
    getMusicUrl(musicInfo, quality = '320k', isRefresh = false) {
      let cancelled = false
      let network = null
      const cancel = () => {
        cancelled = true
        if (network) network.cancelHttp()
      }
      const promise = Promise.resolve().then(async() => {
        if (!isActive()) throw new Error('音源已切换')
        const id = String(musicInfo.songmid ?? '')
        if (!/^\d{1,24}$/.test(id)) throw new Error('GD音乐台需要有效的网易云歌曲 ID')
        const br = { '128k': 128, '320k': 320, flac: 740 }[quality]
        if (!br) throw new Error('GD音乐台暂不支持该音质，请选择 128k、320k 或无损')
        if (cancelled) throw new Error('请求已取消')
        const key = id + '_' + br
        const cached = cache.get(key)
        if (cached && !isRefresh && now() - cached.time < CACHE_MS) return cached.result
        cache.delete(key)
        requests = requests.filter(time => now() - time < WINDOW_MS)
        // Reserve headroom below the provider's 50 requests / 5 minutes.
        // This is per client, not a guarantee for devices sharing an IP.
        if (requests.length >= 40) throw new Error('GD音乐台请求过于频繁，请稍后重试')
        requests.push(now())
        network = request(ENDPOINT + '?types=url&source=netease&id=' + encodeURIComponent(id) + '&br=' + br, {
          method: 'get',
          timeout: 12000,
        })
        let response
        try { response = await network.promise } catch {
          if (cancelled) throw new Error('请求已取消')
          throw new Error('GD音乐台请求失败或超时，请稍后重试')
        }
        if (cancelled) throw new Error('请求已取消')
        if (!isActive()) throw new Error('音源已切换')
        if (response.statusCode === 429) throw new Error('GD音乐台请求过于频繁，请稍后重试')
        if (response.statusCode !== 200) throw new Error('GD音乐台服务暂不可用')
        let body = response.body
        if (typeof body === 'string') {
          try { body = JSON.parse(body) } catch { throw new Error('GD音乐台返回格式错误') }
        }
        if (!body || typeof body.url !== 'string' || body.url.length > 4096 || !/^https:\/\/[^\s]+$/i.test(body.url)) {
          throw new Error('GD音乐台未返回可用的 HTTPS 播放地址')
        }
        const actualBr = Number(body.br)
        if (!Number.isFinite(actualBr) || actualBr <= 0) throw new Error('GD音乐台未返回有效音质')
        // br is an actual bitrate, not necessarily 740/999. Never infer 24-bit.
        const type = actualBr > 320 ? 'flac' : actualBr >= 320 ? '320k' : '128k'
        const result = { url: body.url, type, bitrate: actualBr }
        if (cache.size >= 40) cache.delete(cache.keys().next().value)
        cache.set(key, { time: now(), result })
        return result
      })
      return { promise, cancelHttp: cancel, canceleFn: cancel }
    },
  }
}
