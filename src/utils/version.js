import { httpGet } from '@/utils/request'
import { downloadFile, stopDownload, temporaryDirectoryPath } from '@/utils/fs'
import { getPackageName, getSupportedAbis, installApk } from '@/utils/nativeModules/utils'
import { APP_PROVIDER_NAME } from '@/config/constant'
import { LATEST_RELEASE_API_URL } from '@/config/release'

const abis = [
  'arm64-v8a',
  'armeabi-v7a',
  'x86_64',
  'x86',
  'universal',
]

const request = async(url, retryNum = 0) => {
  return new Promise((resolve, reject) => {
    httpGet(url, {
      timeout: 10000,
    }, (err, resp, body) => {
      if (err || resp.statusCode != 200) {
        ++retryNum >= 3
          ? reject(err || new Error(resp.statusMessage || resp.statusCode))
          : request(url, retryNum).then(resolve).catch(reject)
      } else resolve(body)
    })
  })
}

export const getVersionInfo = async() => {
  const release = JSON.parse(await request(LATEST_RELEASE_API_URL))
  const version = release.tag_name?.replace(/^v/, '')
  if (!version || !Array.isArray(release.assets)) throw new Error('invalid release')

  const isCarEdition = (await getPackageName()).endsWith('.car')
  const assetName = isCarEdition ? /-car-v.*-(?:universal|arm64-v8a|armeabi-v7a|x86_64|x86)\.apk$/ : /-mobile-v.*-(?:universal|arm64-v8a|armeabi-v7a|x86_64|x86)\.apk$/
  const assets = release.assets.filter(asset => assetName.test(asset.name))
  if (!assets.length) throw new Error('no matching APK asset')

  return {
    version,
    desc: release.body || '',
    history: [],
    assets,
  }
}

const getTargetAbi = async() => {
  const supportedAbis = await getSupportedAbis()
  for (const abi of abis) {
    if (supportedAbis.includes(abi)) return abi
  }
  return abis[abis.length - 1]
}
let downloadJobId = null
const noop = (total, download) => {}
let apkSavePath

export const downloadNewVersion = async(assets, onDownload = noop) => {
  const abi = await getTargetAbi()
  const url = assets.find(asset => asset.name.endsWith(`-${abi}.apk`))?.browser_download_url ??
    assets.find(asset => asset.name.endsWith('-universal.apk'))?.browser_download_url
  if (!url) throw new Error('no compatible APK asset')
  let savePath = temporaryDirectoryPath + '/lx-music-mobile.apk'

  if (downloadJobId) stopDownload(downloadJobId)

  const { jobId, promise } = downloadFile(url, savePath, {
    progressInterval: 500,
    connectionTimeout: 20000,
    readTimeout: 30000,
    begin({ statusCode, contentLength }) {
      onDownload(contentLength, 0)
      // switch (statusCode) {
      //   case 200:
      //   case 206:
      //     break
      //   default:
      //     onDownload(null, contentLength, 0)
      //     break
      // }
    },
    progress({ contentLength, bytesWritten }) {
      onDownload(contentLength, bytesWritten)
    },
  })
  downloadJobId = jobId
  return promise.then(() => {
    apkSavePath = savePath
    return updateApp()
  })
}

export const updateApp = async() => {
  if (!apkSavePath) throw new Error('apk Save Path is null')
  await installApk(apkSavePath, APP_PROVIDER_NAME)
}
