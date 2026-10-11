import { httpGet } from '@/utils/request'
import { downloadFile, stopDownload, temporaryDirectoryPath } from '@/utils/fs'
import { getPackageName, getSupportedAbis, installApk } from '@/utils/nativeModules/utils'
import { APP_PROVIDER_NAME } from '@/config/constant'
import { RELEASE_MANIFEST_URLS } from '@/config/release'
import { compareVer } from '@/utils'
import { getReleaseInfo } from './releaseManifest'

const abis = [
  'arm64-v8a',
  'armeabi-v7a',
  'x86_64',
  'x86',
  'universal',
]

export const getVersionInfo = async(includePreRelease = false) => {
  const isCarEdition = (await getPackageName()).endsWith('.car')
  const assetName = isCarEdition ? /-car-v.*-(?:universal|arm64-v8a|armeabi-v7a|x86_64|x86)\.apk$/ : /-mobile-v.*-(?:universal|arm64-v8a|armeabi-v7a|x86_64|x86)\.apk$/
  return getReleaseInfo(httpGet, RELEASE_MANIFEST_URLS, includePreRelease, compareVer, asset => assetName.test(asset.name))
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
