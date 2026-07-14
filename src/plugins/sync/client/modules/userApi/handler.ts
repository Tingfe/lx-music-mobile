import { getUserApiSyncData } from '@/utils/data'
import { overwriteUserApisFromSync } from '@/core/userApi'
import { event } from '@/store/userApi/event'
import { SYNC_CLOSE_CODE } from '@/plugins/sync/constants'

let applyingRemoteData = false
let unregister: (() => void) | null

const handler: LX.Sync.ClientSyncHandlerUserApiActions<LX.Sync.Socket> = {
  async onUserApiSyncData(socket, data) {
    if (!socket.moduleReadys.userApi) return
    applyingRemoteData = true
    try {
      await overwriteUserApisFromSync(data)
    } finally {
      applyingRemoteData = false
    }
  },
  async user_api_sync_get_data() {
    return getUserApiSyncData()
  },
  async user_api_sync_set_data(socket, data) {
    applyingRemoteData = true
    try {
      await overwriteUserApisFromSync(data)
    } finally {
      applyingRemoteData = false
    }
  },
  async user_api_sync_finished(socket) {
    socket.moduleReadys.userApi = true
    unregister?.()
    const listener = () => {
      if (applyingRemoteData || !socket.moduleReadys.userApi) return
      void getUserApiSyncData().then(data => {
        void socket.remoteQueueUserApi.onUserApiSyncData(data).catch(() => {
          socket.close(SYNC_CLOSE_CODE.failed)
        })
      }).catch(() => {
        socket.close(SYNC_CLOSE_CODE.failed)
      })
    }
    event.on('list_changed', listener)
    unregister = () => event.off('list_changed', listener)
    socket.onClose(() => unregister?.())
  },
}

export default handler
