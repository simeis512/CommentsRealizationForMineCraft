'use strict'

const ip = require('ip')
const os = require('os')
const fs = require('fs')
const path = require('path')
const proc = require('child_process')
const readline = require('readline')
const randomstring = require('randomstring')

const axios = require('axios')

const express = require('express')
const cookieParser = require('cookie-parser')
const bodyParser = require('body-parser')
const jsonParser = bodyParser.json()
const pug = require('pug')

const webpack = require('webpack')
const webpackConfig = require('../../webpack.config.js')
const compiler = webpack(webpackConfig)

const puppeteer = require('puppeteer');

const settingJson = JSON.parse(fs.readFileSync('./setting.json', 'utf-8'))
const advancementsJson = JSON.parse(fs.readFileSync('./advancements.json', 'utf-8'))

const superChatActionsJson = JSON.parse(fs.readFileSync('./super_chat_action.json', 'utf-8'))

let actionsJson = loadActions(settingJson.actions_directory)

const chokidar = require("chokidar")
const watcher = chokidar.watch(settingJson.actions_directory, {
    ignored: /[\/\\]\./,
    persistent: true
})

watcher.on('ready', () => {
  console.log("ready watching...")

  watcher.on('add', (path) => {
    console.log(`${path} added.`)
    actionsJson = loadActions(settingJson.actions_directory)
    playersActionsManagerCompensate()
  })

  watcher.on('change', (path) => {
    console.log(`${path} changed.`)
    actionsJson = loadActions(settingJson.actions_directory)
    playersActionsManagerCompensate()
  })
})

const playerDataDir = './players'

const playerInfoObjects = {}
const serverInfoObject = {}


// サーバーの実行
var minecraft_server = proc.spawn(
    'java',
    ['-Xms'+ settingJson.memory, '-Xmx'+ settingJson.memory, '-jar', settingJson.minecraft_server, 'nogui'],
    { cwd: settingJson.minecraft_server_path } // サーバーファイルのディレクトリ
)
// ログを表示する
/*minecraft_server.stdout.on('data', function (log) {
   console.log(""+log)
   logParser(log)
})*/
minecraft_server.stderr.on('data', function (log) {
   console.log(log)
})

readline.createInterface({
  input     : minecraft_server.stdout,
  terminal  : false
}).on('line', function(line) {
  console.log(line)
  logParser(line)
})


const app = express()

app.use(express.static('public'))
app.use(cookieParser())
app.use(bodyParser.urlencoded({extended: true}))
app.set('view engine', 'pug')

app.use(require('webpack-dev-middleware')(compiler, {
  noInfo: true, publicPath: webpackConfig.output.publicPath
}))
app.use(require("webpack-hot-middleware")(compiler))

// トップページ
app.get('/', (req, res, next) => {
  console.log('/ '+ req.cookies.uuid)
  const isLoggedIn = (req.cookies.uuid in playerInfoObjects)
  res.render('index')
})

// プレイヤー情報を要求されたとき
app.get('/player-info', (req, res, next) => {
  console.log('/player-info '+ req.cookies.uuid)
  const uuid = req.cookies.uuid
  const isLoggedIn = (req.cookies.uuid in playerInfoObjects)
  if (isLoggedIn) {
    if (playerInfoObjects[uuid].commentAmplifier == undefined) initMinecraftClient(uuid)
    res.json({
      status: 'success',
      info: {
        isLoggedIn: isLoggedIn,
        isSetUrl: 'browser' in playerInfoObjects[uuid],
        commentAmplifier: playerInfoObjects[uuid].commentAmplifier,
        superChatDescription: playerInfoObjects[uuid].superChatDescription,
        actions: getPlayerActions(uuid)
      }
    })
  } else {
    res.json({
      status: 'error',
      message: 'Not logged in'
    })
  }
})

// ログイン用アドレスにアクセスされたとき
app.get('/login/:oneTimePass?', (req, res, next) => {
  let uuid = Object.keys(playerInfoObjects).filter(uuid => playerInfoObjects[uuid].oneTimePass === req.params.oneTimePass)
  if (uuid.length > 0) {
    uuid = uuid[0]
    res.cookie('uuid', uuid, {maxAge:60*60*24*365, httpOnly:true})
    console.log('Login: '+ playerInfoObjects[uuid].player)

    initMinecraftClient(uuid)

    res.redirect('/')
  } else {
    res.json({
      status: 'error',
      message: 'Not logged in'
    })
  }
})

// コメントがPOSTされたとき（テスト用）
app.post('/comment', jsonParser, (req, res, next) => {
  const uuid = req.cookies.uuid
  console.log('/comment '+ uuid)
  const isLoggedIn = (uuid in playerInfoObjects)
  if (isLoggedIn) {
    commentParser(req.body.comment, 'test', playerInfoObjects[uuid])
    res.json({
      status: 'success',
      commentAmplifier: playerInfoObjects[uuid].commentAmplifier,
      actions: getPlayerActions(uuid)
    })
  } else {
    res.json({
      status: 'error',
      message: 'Not logged in'
    })
  }
})

// コメントがPOSTされたとき（テスト用）
app.post('/super-chat', jsonParser, (req, res, next) => {
  const uuid = req.cookies.uuid
  console.log('/comment '+ uuid)
  const isLoggedIn = (uuid in playerInfoObjects)
  if (isLoggedIn) {
    executeSuperChatCommand(JSON.parse(req.body.data), playerInfoObjects[uuid])
    res.json({
      status: 'success',
      commentAmplifier: playerInfoObjects[uuid].commentAmplifier,
      actions: getPlayerActions(uuid)
    })
  } else {
    res.json({
      status: 'error',
      message: 'Not logged in'
    })
  }
})

// YouTube LiveのチャットのURLがPOSTされたとき
app.post('/youtube-chat-url-enter', jsonParser, (req, res, next) => {
  const uuid = req.cookies.uuid
  console.log('/youtube-chat-url-enter '+ uuid)
  const isLoggedIn = (uuid in playerInfoObjects)
  const playerInfoObject = playerInfoObjects[uuid]
  if (isLoggedIn && /^(https:\/\/studio.youtube.com\/live_chat\?.*v=)??[0-9a-zA-Z]{11}.*/.test(req.body.url)) {
    const url = /^[0-9a-zA-Z]{11}$/.test(req.body.url)
      ? `https://studio.youtube.com/live_chat?is_popout=1&v=${req.body.url}`
      : req.body.url
    ;(async () => {
      // Headless Chromeでチャット画面を開く 
      playerInfoObject.browser = await puppeteer.launch()
      playerInfoObject.page = await playerInfoObject.browser.newPage()
      const response = await playerInfoObject.page.goto(url)
      if (response.status() === 200) {
        // チャットの変更を監視する
        await playerInfoObject.page.evaluate(() => {
          const observer = new MutationObserver((records) => {
            //console.log(records)
            records.some((record) => {
              return Array.from(record.addedNodes).some((addedNode) => {
                if (typeof addedNode.querySelector !== 'function') return false
                if (addedNode.nodeName.toLocaleLowerCase() === 'yt-live-chat-text-message-renderer') {
                  const message = addedNode.querySelector('#message').innerText
                  const authorName = addedNode.querySelector('#author-name').innerText
                  const authorType = addedNode.getAttribute('author-type')

                  const data = {
                    type: 'normal',
                    comment: message,
                    authorName,
                    authorType
                  }
                  console.log(JSON.stringify(data))
                  return true
                } else if (addedNode.nodeName.toLocaleLowerCase() === 'yt-live-chat-paid-message-renderer') {
                  const oilKing = addedNode.querySelector('#author-name').innerText
                  const fiveQuadrillionYen = addedNode.querySelector('#purchase-amount').innerText
                  const message = addedNode.querySelector('#message').innerText
                  
                  const minecraftUserExtract = message.match(/@([0-9a-zA-Z_]{3,16})/)
                  const minecraftUser = minecraftUserExtract ? minecraftUserExtract[1] : null
                  
                  const rgb = window.getComputedStyle(addedNode.querySelector('#content')).getPropertyValue('background-color').match(/([0-9]{1,3})/g).slice(0, 3)
                  const hexColor = `#${rgb.map((c) => ('0'+ c.toString(16)).slice(-2)).join('')}`
                  
                  const data = {
                    type: 'super-chat',
                    comment: message,
                    author_name: oilKing,
                    purchase_amount: fiveQuadrillionYen,
                    minecraft_user: minecraftUser,
                    hex_color: hexColor
                  }
                  console.log(JSON.stringify(data))
                  return true
                }
                return false
              })
            })
          })
          const config = {
            // attributes: true,
            childList: true,
            characterData: true,
            subtree: true
          }
          const target = document.querySelector('#item-scroller')
          observer.observe(target, config)
        })
        // MutationObserverからのconsole.logを受け取る
        playerInfoObject.page.on('console', (msg) => {
          console.log(msg.text())
          try {
            msg = JSON.parse(msg.text())

            if ('type' in msg) {
              if (msg.type === 'normal') {
                if ((msg.authorType === 'owner' ||
                    settingJson.accept_moderator_command_execution &&
                    msg.authorType === 'moderator') &&
                    /^\/[a-zA-Z]+/.test(msg.comment)) {
                  executeCommand(stringTemplateParser(msg.comment, { player: playerInfoObject.player }))
                } else {
                  commentParser(msg.comment, msg.authorName, playerInfoObject)
                }
              } else if (msg.type === 'super-chat') {
                executeSuperChatCommand(msg, playerInfoObject)
              }
            }
          } catch (e) {
            console.log(e)
          }
        })
        console.log('Complate')
        res.json({
          status: 'success',
          commentAmplifier: playerInfoObject.commentAmplifier,
          actions: getPlayerActions(uuid)
        })
      } else {
        (async () => {
          await playerInfoObject.browser.close()
          res.json({
            status: 'error',
            message: response.text()
          })
        })();
      }
    })()
  } else {
    res.json({
      status: 'error',
      message: 'Not logged in'
    })
  }
})

app.get('/actions', (req, res, next) => {
  const uuid = req.cookies.uuid
  console.log('/actions '+ uuid)
  const isLoggedIn = (uuid in playerInfoObjects)
  if (isLoggedIn) {
    res.json({
      status: 'success',
      commentAmplifier: playerInfoObjects[uuid].commentAmplifier,
      actions: getPlayerActions(uuid)
    })
  } else {
    res.json({
      status: 'error',
      message: 'Not logged in'
    })
  }
})

const server = app.listen(settingJson['web_server_port'], () => {
  console.log('Server start')
})

// 定期的に走る
serverInfoObject.interval = setInterval(() => {
  Object.keys(playerInfoObjects).forEach(uuid => {
    const playerInfoObject = playerInfoObjects[uuid]
    Object.keys(playerInfoObject.actionsManager).forEach((caption, index) => {
      const actionManager = playerInfoObject.actionsManager[caption]
      const action = actionsJson.filter((action) => action.caption === caption)[0]
      if (!action) return
      const amount = Math.floor(actionManager.commentPower / action.cost)
      actionManager.commentPower %= action.cost
      if (amount > 0) {
        if (!action.random) {
          // コマンド発火
          action.commands.forEach(command => {
            executeCommand(stringTemplateParser(command, { player: playerInfoObject.player, amount: amount }))
          })
        } else {
          // 共通コマンド発火
          action.common_commands.forEach(command => {
            executeCommand(stringTemplateParser(command, { player: playerInfoObject.player, amount: amount }))
          })
          // ランダムコマンド発火
          const randomIndex = Math.floor(action.commands.length * Math.random())
          action.commands[randomIndex].forEach(command => {
            executeCommand(stringTemplateParser(command, { player: playerInfoObject.player, amount: amount }))
          })
        }
      }
      // savePlayerData(uuid)
    })
  })
}, settingJson.actions_check_interval_milliseconds)

function loadActions(dirPath)
{
  const requireParams = [/caption/, /(words|regex)/, /commands/, /cost/, /affect_comment_power/]
  const acrionFileNames = fs.readdirSync(dirPath)
  return acrionFileNames
    .filter((fileName) => /^[^_].+\.json$/.test(fileName))
    .reduce((list, fileName) => list.concat(JSON.parse(fs.readFileSync(path.join(dirPath, fileName), 'utf-8'))), [])
    .filter((action) => !requireParams.some((param) => {
      Object.keys(action).some((actionKeys) => !param.test(actionKeys))
    }))
}

function playersActionsManagerCompensate()
{
  Object.keys(playerInfoObjects).forEach(uuid => {
    const playerInfoObject = playerInfoObjects[uuid]
    actionsJson.forEach((action) => {
      if (!(action.caption in playerInfoObject.actionsManager)) {
        playerInfoObject.actionsManager[action.caption] = {}
        playerInfoObject.actionsManager[action.caption].commentPower = 0
      }
    })
  })
}

function getPlayerActions(uuid)
{
  return Object.keys(playerInfoObjects[uuid].actionsManager)
    .filter((caption) => !actionsJson.filter((action) => action.caption === caption)[0].hidden)
    .map((caption, index) => {
      return {
        ...actionsJson.filter((action) => action.caption === caption)[0],
        ...playerInfoObjects[uuid].actionsManager[caption],
        ...{ id: index }
      }
    })
}

function savePlayerData(uuid)
{
  const saveKeysWhiteList = ['player', 'actionsManager', 'commentAmplifier']
  const data = Object.keys(playerInfoObjects[uuid])
    .filter((key) => saveKeysWhiteList.includes(key))
    .reduce((ret, key) => {
      ret[key] = playerInfoObjects[uuid][key]
      return ret
    }, {})
  if (!fs.existsSync(playerDataDir)) fs.mkdirSync(playerDataDir)
  fs.writeFile(path.join(playerDataDir, `${uuid}.json`), JSON.stringify(data), (err) => {
    if (err) throw err
    // console.log(`${path.join(playerDataDir, `${uuid}.json`)} を保存しました`);
  })
}

function initMinecraftClient(uuid)
{
  if (serverInfoObject.minecraftVersion >= '1.12') {
    executeCommand(`/w ${playerInfoObjects[uuid].player} Checking your Advancement`)
    if (serverInfoObject.minecraftVersion >= '1.13') {
      advancementsJson.forEach(advancementId => {
        executeCommand(`/execute if entity @a[name=${playerInfoObjects[uuid].player},advancements={${advancementId}=true}] run w ${playerInfoObjects[uuid].player} You advanced: ${advancementId.split(':')[1]}`)
      })
    } else {
      advancementsJson.forEach(advancementId => {
        executeCommand(`/advancement test ${playerInfoObjects[uuid].player} ${advancementId}`)
      })
    }
    executeCommand(`/w ${playerInfoObjects[uuid].player} Advancement check Complete!`)
  }

  superChatActionsJson.initializeCommands.forEach((command, index) => {
    executeCommand(stringTemplateParser(command, { player: playerInfoObjects[uuid].player }))
  })
}

function logParser(log)
{
  log = log.toString()

  // MineCraftサーバ起動時
  if (/Starting minecraft server/.test(log)) {
    serverInfoObject.minecraftVersion = log.match(/version (\d+\.\d+\.??\d*)$/)[1]
  }

  // 認証時
  if (/UUID of player/.test(log)) {
    // UUID、プレイヤー名取得
    const uuid = log.match(/is ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/)[1]
    try {
      playerInfoObjects[uuid] = JSON.parse(fs.readFileSync(path.join(playerDataDir, `${uuid}.json`)))
      actionsJson.forEach((action) => {
        if (!(action.caption in playerInfoObjects[uuid].actionsManager)) {
          playerInfoObjects[uuid].actionsManager[action.caption] = {}
          playerInfoObjects[uuid].actionsManager[action.caption].commentPower = 0
        }
      })
      console.log(playerInfoObjects[uuid])
    } catch (e) {
      console.log(e)
      playerInfoObjects[uuid] = {}

      playerInfoObjects[uuid].player = log.match(/player (.+) is/)[1]

      playerInfoObjects[uuid].actionsManager = {}
      actionsJson.forEach((action) => {
        playerInfoObjects[uuid].actionsManager[action.caption] = {}
        playerInfoObjects[uuid].actionsManager[action.caption].commentPower = 0
      })
    }
    playerInfoObjects[uuid].chattedAuthorNames = []
    playerInfoObjects[uuid].superChatDescription = stringTemplateParser(superChatActionsJson.description, { player: playerInfoObjects[uuid].player })
  }

  // ログイン時
  if (/logged in/.test(log)) {
    // UUID、プレイヤー名取得
    const player = log.match(/: (.+)\[\//)[1]
    let uuid = getUUID(player)
    if (uuid === null) return
    // アドレス取得
    playerInfoObjects[uuid].address = log.match(/\[\/(\d{1,3}.\d{1,3}.\d{1,3}.\d{1,3}):/)[1]
  }

  // 参加時
  if (/joined/.test(log)) {
    const player = log.match(/: (.+) joined/)[1]
    let uuid = getUUID(player)
    if (uuid === null) return

    // ワンタイムパス生成
    playerInfoObjects[uuid].oneTimePass = randomstring.generate(32)
    // アドレス取得
    const addressList = getAddresses(playerInfoObjects[uuid].address)
    // マイクラにログイン用URL送信
    addressList.forEach((address, index) => {
      executeCommand(`/tellraw ${playerInfoObjects[uuid].player} {"text":"クリックしてログイン (アドレス #${index+1})","color":"aqua","bold":true,"clickEvent":{"action":"open_url","value":"http://${address}:${settingJson['web_server_port']}/login/${playerInfoObjects[uuid].oneTimePass}"}}`)
    })
  }

  // 進捗チェック開始時
  if (/Checking your Advancement/.test(log)) {
    // UUID、プレイヤー名取得
    const player = log.match(/whisper to (.+):/)[1]
    let uuid = getUUID(player)
    if (uuid === null) return

    playerInfoObjects[uuid].commentAmplifier = 0
  }

  // 進捗チェック中
  if (/You advanced:/.test(log)) {
    // UUID、プレイヤー名取得
    const player = log.match(/whisper to (.+): You/)[1]
    let uuid = getUUID(player)
    if (uuid === null) return

    playerInfoObjects[uuid].commentAmplifier++
  }

  // 進捗チェック終了時
  if (/Advancement check Complete!/.test(log)) {
    // UUID、プレイヤー名取得
    const player = log.match(/whisper to (.+):/)[1]
    let uuid = getUUID(player)
    if (uuid === null) return

    executeCommand(`/tellraw ${playerInfoObjects[uuid].player} {"text":"コメントパワー: ${playerInfoObjects[uuid].commentAmplifier}"}`)
  }

  // 進捗達成時
  if (/(has made the advancement|has reached the goal)/.test(log)) {
    // UUID、プレイヤー名取得
    const player = log.match(/: (.+) has/)[1]
    let uuid = getUUID(player)
    if (uuid === null) return

    playerInfoObjects[uuid].commentAmplifier++
    if (/Stone Age/.test(log) && playerInfoObjects[uuid].commentAmplifier === 0) playerInfoObjects[uuid].commentAmplifier++ // 最初の進捗が加算されないため
    executeCommand(`/tellraw ${playerInfoObjects[uuid].player} {"text":"コメントパワー: ${playerInfoObjects[uuid].commentAmplifier}"}`)
  }

  // 退出時
  if (/left/.test(log)) {
    // UUID、プレイヤー名取得
    const player = log.match(/: (.+) left/)[1]
    let uuid = getUUID(player)
    // データ保存
    savePlayerData(uuid)
    // ブラウザ閉じる
    if (playerInfoObjects[uuid].browser) {
      (async () => {
        await playerInfoObjects[uuid].browser.close()
      })();
    }

    // 退出プレイヤー情報削除
    if (uuid !== null) delete playerInfoObjects[uuid]
  }
}

function getUUID(player)
{
  let uuid = Object.keys(playerInfoObjects).filter((uuid) => playerInfoObjects[uuid].player === player)
  if (uuid.length <= 0) return null
  return uuid[0]
}

function commentParser(comment, authorName, playerInfoObject)
{
  // コメント正規化
  comment = comment.replace(/^<[^>]*>|<[^>]*>$/g, '')
  console.log('comment: '+ comment)
  
  // トリガー検索
  actionsJson.forEach((action, index) => {
    // 単語で登録
    if ('words' in action) {
      action.words.some((word) => {
        if (comment.indexOf(word) !== -1) {
          if (!settingJson.allow_duplication_comment && isDuplication(action.caption, authorName, playerInfoObject)) return true
          if (action.affect_comment_power) {
            playerInfoObject.actionsManager[action.caption].commentPower += playerInfoObject.commentAmplifier
          } else {
            playerInfoObject.actionsManager[action.caption].commentPower += 1
          }
          return true
        }
        return false
      })
    }
    // 正規表現で登録
    else if ('regex' in action) {
      if ((new RegExp(action.regex)).test(comment)) {
        if (!settingJson.allow_duplication_comment && isDuplication(action.caption, authorName, playerInfoObject)) return true
        if (action.affect_comment_power) {
          playerInfoObject.actionsManager[action.caption].commentPower += playerInfoObject.commentAmplifier
        } else {
          playerInfoObject.actionsManager[action.caption].commentPower += 1
        }
      }
    }
  })
}

function isDuplication(actionCaption, authorName, playerInfoObject)
{
  if (authorName in playerInfoObject.chattedAuthorNames) {
    if (playerInfoObject.chattedAuthorNames[authorName] === actionCaption) {
      return true
    }
  }
  
  playerInfoObject.chattedAuthorNames[authorName] = actionCaption
  return false
}

function executeSuperChatCommand(data, playerInfoObject)
{
  data.player = playerInfoObject.player
  superChatActionsJson.commands.forEach((command, index) => {
    executeCommand(stringTemplateParser(command, data))
  })
  if (data.minecraft_user) {
    superChatActionsJson.minecraftUserCommands.forEach((command, index) => {
      executeCommand(stringTemplateParser(command, data))
    })
  }
}

function executeCommand(command)
{
  minecraft_server.stdin.write(command +'\r')
  /* if (!minecraft_server.stdin.write(command +'\r')) {
    minecraft_server.stdin.once('drain')
  } */
}

function stringTemplateParser(expression, valueObj)
{
  const templateMatcher = /{{\s?([^{}\s]*)\s?}}/g
  let text = expression.replace(templateMatcher, (substring, value, index) => {
    value = valueObj[value]
    return value
  })
  return text
}

function getAddresses(playerAddress)
{
  const address = getLocalAddresses()
  if (playerAddress in address || playerAddress === '127.0.0.1') {
    return ['localhost']
  }
  return address
}

function getBroadcastAddresses()
{
  let ifaces = os.networkInterfaces()

  let results = []

  Object.keys(ifaces).forEach(function (ifname) {

    ifaces[ifname].forEach(function (iface) {
      if ('IPv4' !== iface.family || iface.internal !== false) {
        // skip over internal (i.e. 127.0.0.1) and non-ipv4 addresses
        return
      }

      let broadcastAddress = ip.or(iface.address, ip.not(iface.netmask))
      results.push(broadcastAddress)
    })
  })

  return results
}

function getLocalAddresses()
{
  var ifacesObj = []
  var interfaces = os.networkInterfaces()

  for (var dev in interfaces) {
      interfaces[dev].forEach(function(details){
          if (!details.internal){
              switch(details.family){
                  case "IPv4":
                      ifacesObj.push(details.address)
                  break
              }
          }
      })
  }
  return ifacesObj
}
