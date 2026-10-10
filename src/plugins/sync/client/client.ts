import { encryptMsg, decryptMsg } from './utils'
import { callObj } from './sync'
// import { action as commonAction } from '@/store/modules/common'
// import { getStore } from '@/store'
// import registerSyncListHandler from './syncList'
import log from '../log'
import { aesEncrypt } from '../utils'
import { setSyncStatus } from '@/core/sync'
import { dateFormat } from '@/utils/common'
import { createMsg2call } from 'message2call'
import { toast } from '@/utils/tools'
import { SYNC_CLOSE_CODE, SYNC_CODE } from '../constants'

let status: LX.Sync.Status = {
  status: false,
  message: '',
}

export const sendSyncStatus = (newStatus: Omit<LX.Sync.Status, 'address'>) => {
  status.status = newStatus.status
  status.message = newStatus.message
  setSyncStatus(status)
}

export const sendSyncMessage = (message: string) => {
  status.message = message
  setSyncStatus(status)
}

const heartbeatTools = {
  failedNum: 0,
  maxTryNum: 100000,
  stepMs: 3000,
  connectTimeout: null as NodeJS.Timeout | null,
  pingTimeout: null as NodeJS.Timeout | null,
  delayRetryTimeout: null as NodeJS.Timeout | null,
  handleOpen(socket: LX.Sync.Socket) {
    console.log('open')
    // this.failedNum = 0
    this.heartbeat(socket)
  },
  heartbeat(socket: LX.Sync.Socket) {
    if (this.pingTimeout) clearTimeout(this.pingTimeout)

    // Use `WebSocket#terminate()`, which immediately destroys the connection,
    // instead of `WebSocket#close()`, which waits for the close timer.
    // Delay should be equal to the interval at which your server
    // sends out pings plus a conservative assumption of the latency.
    this.pingTimeout = setTimeout(() => {
      if (client === socket) socket.close()
    }, 30000 + 1000)
  },
  reConnnect() {
    this.clearTimeout()
    // client = null
    if (!client) return
    const socket = client

    if (++this.failedNum > this.maxTryNum) {
      this.failedNum = 0
      sendSyncStatus({
        status: false,
        message: 'Connect error',
      })
      throw new Error('connect error')
    }

    const waitTime = Math.min(2000 + Math.floor(this.failedNum / 2) * this.stepMs, 30000)

    // sendSyncStatus({
    //   status: false,
    //   message: `Waiting ${waitTime / 1000}s reconnnect...`,
    // })

    this.delayRetryTimeout = setTimeout(() => {
      this.delayRetryTimeout = null
      if (client !== socket) return
      console.log(dateFormat(new Date()), 'reconnnect...')
      sendSyncStatus({
        status: false,
        message: `Try reconnnect... (${this.failedNum})`,
      })
      connect(socket.data.urlInfo, socket.data.keyInfo)
    }, waitTime)
  },
  clearTimeout() {
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout)
      this.connectTimeout = null
    }
    if (this.delayRetryTimeout) {
      clearTimeout(this.delayRetryTimeout)
      this.delayRetryTimeout = null
    }
    if (this.pingTimeout) {
      clearTimeout(this.pingTimeout)
      this.pingTimeout = null
    }
  },
  connect(socket: LX.Sync.Socket) {
    console.log('heartbeatTools connect')
    this.connectTimeout = setTimeout(() => {
      if (client !== socket) return
      this.connectTimeout = null
      if (client) {
        try {
          client.close(SYNC_CLOSE_CODE.failed)
        } catch {}
      }
      if (++this.failedNum > this.maxTryNum) {
        this.failedNum = 0
        sendSyncStatus({
          status: false,
          message: 'Connect error',
        })
        throw new Error('connect error')
      }
      sendSyncStatus({
        status: false,
        message: 'Connect timeout, try reconnect...',
      })
      this.reConnnect()
    }, 2 * 60 * 1000)
    socket.addEventListener('open', () => {
      if (client !== socket) return
      if (this.connectTimeout) {
        clearTimeout(this.connectTimeout)
        this.connectTimeout = null
      }
      this.handleOpen(socket)
    })
    socket.addEventListener('message', ({ data }) => {
      if (client !== socket) return
      if (data == 'ping') this.heartbeat(socket)
    })
    socket.addEventListener('close', (event) => {
      if (client !== socket) return
      // console.log(event.code)
      switch (event.code) {
        case SYNC_CLOSE_CODE.normal:
        case SYNC_CLOSE_CODE.failed:
          return
      }
      this.reConnnect()
    })
  },
}


let client: LX.Sync.Socket | null
export const getClient = (): LX.Sync.Socket | null => client?.isReady ? client : null
// let listSyncPromise: Promise<void>
export const connect = (urlInfo: LX.Sync.UrlInfo, keyInfo: LX.Sync.KeyInfo, onInitialAuthFailed?: () => Promise<void>) => {
  const previousClient = client
  const socket = new WebSocket(`${urlInfo.wsProtocol}//${urlInfo.hostPath}/socket?i=${encodeURIComponent(keyInfo.clientId)}&t=${encodeURIComponent(aesEncrypt(SYNC_CODE.msgConnect, keyInfo.key))}`) as LX.Sync.Socket
  client = socket
  heartbeatTools.clearTimeout()
  previousClient?.close(SYNC_CLOSE_CODE.normal)
  socket.data = {
    keyInfo,
    urlInfo,
  }
  heartbeatTools.connect(socket)

  let closeEvents: Array<(err: Error) => (void | Promise<void>)> = []
  let disconnected = true
  let syncFinished = false
  const isCurrent = () => client === socket && !disconnected

  const message2read = createMsg2call<LX.Sync.ServerSyncActions>({
    funcsObj: {
      ...callObj,
      finished() {
        if (!isCurrent()) return
        toast('Sync connected')
        syncFinished = true
        socket.isReady = true
        sendSyncStatus({
          status: true,
          message: '',
        })
        heartbeatTools.failedNum = 0
      },
    },
    timeout: 120 * 1000,
    sendMessage(data) {
      if (!isCurrent()) throw new Error('disconnected')
      void encryptMsg(keyInfo, JSON.stringify(data)).then((data) => {
        if (isCurrent()) socket.send(data)
      }).catch((err) => {
        log.error('encrypt msg error: ', err)
        if (isCurrent()) socket.close(SYNC_CLOSE_CODE.failed)
      })
    },
    onCallBeforeParams(rawArgs) {
      if (!isCurrent()) throw new Error('disconnected')
      return [socket, ...rawArgs]
    },
    onError(error, path, groupName) {
      const name = groupName ?? ''
      log.r_error(`sync call ${name} ${path.join('.')} error:`, error)
      // if (groupName == null) return
      // client?.close(SYNC_CLOSE_CODE.failed)
      // sendSyncStatus({
      //   status: false,
      //   message: error.message,
      // })
    },
  })

  socket.remote = message2read.remote
  socket.remoteQueueList = message2read.createQueueRemote('list')
  socket.remoteQueueDislike = message2read.createQueueRemote('dislike')
  socket.remoteQueueUserApi = message2read.createQueueRemote('userApi')
  socket.remoteQueueSettings = message2read.createQueueRemote('settings')
  socket.remoteQueueRemoteControl = message2read.createQueueRemote('remoteControl')

  socket.addEventListener('message', ({ data }) => {
    if (!isCurrent()) return
    if (data == 'ping') return
    if (typeof data === 'string') {
      void decryptMsg(keyInfo, data).then((data) => {
        if (!isCurrent()) return
        let syncData: LX.Sync.ServerSyncActions
        try {
          syncData = JSON.parse(data)
        } catch (err) {
          log.error('parse msg error: ', err)
          socket.close(SYNC_CLOSE_CODE.failed)
          return
        }
        message2read.message(syncData)
      }).catch((error) => {
        log.error('decrypt msg error: ', error)
        if (isCurrent()) socket.close(SYNC_CLOSE_CODE.failed)
      })
    }
  })
  socket.onClose = function(handler: typeof closeEvents[number]) {
    closeEvents.push(handler)
    return () => {
      const index = closeEvents.indexOf(handler)
      if (index >= 0) closeEvents.splice(index, 1)
    }
  }

  const initMessage = 'Wait syncing...'
  socket.addEventListener('open', () => {
    if (client !== socket) return
    log.info('connect')
    // const store = getStore()
    // global.lx.syncKeyInfo = keyInfo
    socket.isReady = false
    socket.moduleReadys = {
      list: false,
      dislike: false,
      userApi: false,
      settings: false,
    }
    disconnected = false
    sendSyncStatus({
      status: false,
      message: initMessage,
    })
  })
  socket.addEventListener('close', ({ code }) => {
    socket.isReady = false
    const err = new Error('closed')
    try {
      for (const handler of closeEvents) void handler(err)
    } catch (err: any) {
      log.error(err?.message)
    }
    closeEvents = []
    disconnected = true
    message2read.destroy()
    if (client !== socket) return
    switch (code) {
      case SYNC_CLOSE_CODE.normal:
      // case SYNC_CLOSE_CODE.failed:
        sendSyncStatus({
          status: false,
          message: '',
        })
        break
      case SYNC_CLOSE_CODE.failed:
        if (!syncFinished && onInitialAuthFailed) {
          void onInitialAuthFailed().catch(err => {
            log.error('remove expired sync auth key error: ', err)
          })
          sendSyncStatus({
            status: false,
            message: SYNC_CODE.authFailed,
          })
          break
        }
        if (!status.message || status.message == initMessage) {
          sendSyncStatus({
            status: false,
            message: 'failed',
          })
        }
        break
    }
  })
  socket.addEventListener('error', ({ message }) => {
    if (client !== socket) return
    sendSyncStatus({
      status: false,
      message,
    })
  })
}

export const disconnect = async() => {
  if (!client) return
  log.info('disconnecting...')
  const socket = client
  client = null
  socket.close(SYNC_CLOSE_CODE.normal)
  heartbeatTools.clearTimeout()
  heartbeatTools.failedNum = 0
}

export const getStatus = (): LX.Sync.Status => status
