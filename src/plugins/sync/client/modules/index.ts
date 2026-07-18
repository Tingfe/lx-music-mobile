import * as list from './list'
import * as dislike from './dislike'
import * as userApi from './userApi'
import * as settings from './settings'
import * as remoteControl from './remoteControl'
// export * as theme from './theme'


export const callObj = Object.assign({},
  list.handler,
  dislike.handler,
  userApi.handler,
  settings.handler,
  remoteControl.handler,
)


export const modules = {
  list,
  dislike,
  userApi,
  settings,
}

export const featureVersion = {
  list: 1,
  dislike: 1,
  userApi: 1,
  settings: 1,
} as const
