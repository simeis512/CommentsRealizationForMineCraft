<template lang="pug">
  div(
    :style="`background-color: ${backgroundColor}`"
    style="position: absolute; width: 100%; height: 100%"
  )
    template(v-if="isLoggedIn")
      template(v-if="isSetUrl")
        .d-flex(
          :class="{ 'flex-column': isVerticalMode }"
          :style="isVerticalMode ? 'height: 100%' : ''"
        )
          .text-center.d-flex.flex-column.ma-2
            .mplus1p(
              style="white-space: nowrap"
            ) コメントパワー
            .teal--text.mplus1p(
              style="font-size: 3.75rem; font-height: 3.75rem"
            ) {{ commentAmplifier }}

          v-row.ma-0.flex-nowrap(
            :class="isVerticalMode ? 'actions-container-vertical flex-column' : 'actions-container-horizontal'"
          )
            .d-flex(
              v-for="rowActions in rotatedActions"
              :class="isVerticalMode ? 'flex-row justify-center' : 'flex-column'"
            )
              .text-center.d-flex.flex-column.align-center.pa-2(
                v-for="action in rowActions"
                :key="action.id"
                :class="rotationActionClass"
                :style="{ '--duration': `${rotationMilliSeconds / 2}ms` }"
              )
                v-tooltip(
                  :color="action.regex ? 'red darken-4' : ''"
                  bottom
                )
                  template(v-slot:activator="{ on, attrs }")
                    div(
                      v-bind="attrs"
                      v-on="on"
                      style="cursor: default"
                    )
                      v-progress-circular(
                        :rotate="-90"
                        :size="100"
                        :width="15"
                        :value="action.commentPower / action.cost * 100"
                        :color="action.affect_comment_power ? 'teal' : 'indigo'"
                      )
                        .d-flex.flex-column
                          div {{ action.commentPower }}
                          v-divider
                          div {{ action.cost }}
                      .mplus1p(
                        :class="action.affect_comment_power ? 'teal--text' : 'indigo--text'"
                      ) {{ action.caption }}
                  span(
                    v-if="action.words"
                  )
                    div(
                      v-for="word in action.words"
                      :key="word"
                    ) {{ word }}
                  span(
                    v-if="action.regex"
                  ) /{{ action.regex }}/

          v-row.ma-0.mt-n3(
            v-if="isVerticalMode"
          )
            v-col(
              cols="12"
            )
              .text-body-1 {{ superChatDescription }}

        v-row.ma-0.mt-n3(
          v-if="!isVerticalMode"
        )
          v-col(
            cols="12"
          )
            .text-body-1 {{ superChatDescription }}

        v-text-field(
          v-model="commentTest"
          label="コメントテスト"
          outlined
          v-if="false"
          @keydown="submitComment"
        )
      //--  v-btn(
          v-if="true"
          @click="submitSuperChat"
        ) スパチャテスト

      template(v-else)
        v-container.d-flex.justify-center.align-center(
          style="height: 100%"
        )
          v-row
            v-col(
              cols="12"
            )
              v-text-field(
                v-model="chatUrl"
                label="YouTube Live チャット URL"
                placeholder="https://studio.youtube.com/live_chat?is_popout=1&v=XXXXXXXXXXX (後半のIDだけでも可)"
                width="400"
                outlined
                :loading="chatLoading"
                :disabled="chatLoading"
                @keydown="submitChatUrl"
              )
            v-col(
              cols="12"
              sm="8"
              offset-sm="2"
              md="6"
              offset-md="3"
            )
              v-textarea(
                label="Tips"
                value="Minecraft側でコマンド\n「/gamerule sendCommandFeedback false」\nを実行しておくことをオススメします。\n（コマンドの実行結果が表示されなくなります）"
                color="grey"
                readonly
                outlined
                auto-grow
              )
    template(v-else)
        v-container.d-flex.justify-center.align-center(
          style="height: 100%"
        )
          v-row
            v-col
              .text-h4.text-center MineCraft からログインしてください
</template>

<script>
import axios from 'axios'

export default {
  data() {
    return {
      backgroundColor: 'transparent',
      isVerticalMode: false,

      chatLoading: false,
      isLoggedIn: false,
      chatUrl: '',
      commentTest: '',
      isSetUrl: false,

      commentAmplifier: 0,
      superChatDescription: '',
      actions: [],

      actionsRow: 1,
      rotationCount: 0,
      rotationMilliSeconds: 2000,
      isPlayingRotationAnimation: false,
      rotationInterval: null,
      getActionsInterval: null,

      superChatData: {
        type: 'super-chat',
        comment: 'スパチャのテスト @Simeis',
        author_name: '石油王',
        purchase_amount: '￥5,000,000,000,000,000',
        minecraft_user: 'Simeis',
        hex_color: '#d00000'
      }
    }
  },
  computed: {
    slicedActions() {
      return this.sliceByNumber(this.actions, this.actionsRow)
    },
    rotatedActions() {
      const tmp = [ ...this.slicedActions ]
      for (let i=0; i<this.rotationCount; ++i) tmp.push(tmp.shift())
      return tmp
    },
    rotationActionClass() {
      const retClass = []
      if (this.isPlayingRotationAnimation)
        retClass.push(this.isVerticalMode ? 'rotation-animation-vertical' : 'rotation-animation-horizontal')
      return retClass
    }
  },
  async mounted() {
    const response = (await axios.get('/player-info')).data
    if (response.status === 'success') {
      this.isLoggedIn = response.info.isLoggedIn
      this.isSetUrl = response.info.isSetUrl
      this.commentAmplifier = response.info.commentAmplifier
      this.superChatDescription = response.info.superChatDescription
      this.actions = response.info.actions
    }

    this.rotationInterval = setInterval(() => {
      this.rotationCount = ++this.rotationCount % Math.ceil(this.actions.length / this.actionsRow)
      setTimeout(() => this.isPlayingRotationAnimation = true, this.rotationMilliSeconds / 2)
      this.isPlayingRotationAnimation = false
    }, this.rotationMilliSeconds)

    this.getActionsInterval = setInterval(this.getActions, 500)

    const backgroundColor = location.search.match(/background(-color)?=([0-9a-fA-F]{6})/)
    if (backgroundColor) this.backgroundColor = `#${backgroundColor[2]}`

    const row = location.search.match(/row?=([0-9]+)/)
    if (row) this.actionsRow = Math.max(row[1], 1)

    this.isVerticalMode = /vertical/.test(location.search)
  },
  methods: {
    async getActions() {
      // if (!this.isSetUrl) return
      const response = (await axios.get('/player-info')).data
      if (response.status === 'success') {
        this.isLoggedIn = response.info.isLoggedIn
        this.isSetUrl = response.info.isSetUrl
        this.commentAmplifier = response.info.commentAmplifier
        this.superChatDescription = response.info.superChatDescription
        this.actions = response.info.actions
      } else {
        this.isLoggedIn = false
        this.isSetUrl = false
      }
    },
    async submitChatUrl(e) {
      if (e.key !== 'Enter') return

      this.chatLoading = true
      const response = (await axios.post('/youtube-chat-url-enter', {
        url: this.chatUrl
      })).data
      if (response.status === 'success') {
        this.actions = response.actions
        this.isSetUrl = true
      } else {
        
      }
      this.chatLoading = false
    },
    async submitComment(e) {
      if (e.key !== 'Enter') return

      this.chatLoading = true
      const response = (await axios.post('/comment', {
        comment: this.comment
      })).data
      if (response.status === 'success') {
        this.actions = response.actions
      } else {
        
      }
      this.chatLoading = false
    },
    async submitSuperChat() {
      this.chatLoading = true
      const response = (await axios.post('/super-chat', {
        data: JSON.stringify(this.superChatData)
      })).data
      if (response.status === 'success') {
        this.actions = response.actions
      } else {
        
      }
      this.chatLoading = false
    },
    sliceByNumber(array, number) {
      const length = Math.ceil(array.length / number)
      return new Array(length).fill().map((_, i) =>
        array.slice(i * number, (i + 1) * number)
      )
    }
  }
}
</script>

<style>
.mplus1p {
  font-family: 'M PLUS 1p', sans-serif !important;
}

.actions-container-horizontal, .actions-container-vertical {
  overflow: hidden;
}

.actions-container-horizontal {
  mask-image: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 5%, rgba(255,255,255,1) 95%, rgba(255,255,255,0) 100%);
  -webkit-mask-image: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 5%, rgba(255,255,255,1) 95%, rgba(255,255,255,0) 100%);
  width: 100%;
}

.actions-container-vertical {
  mask-image: linear-gradient(0deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 5%, rgba(255,255,255,1) 95%, rgba(255,255,255,0) 100%);
  -webkit-mask-image: linear-gradient(0deg, rgba(255,255,255,0) 0%, rgba(255,255,255,1) 5%, rgba(255,255,255,1) 95%, rgba(255,255,255,0) 100%);
  height: 100%;
}

.rotation-animation-horizontal {
  --duration: 1s;
  animation: rotation-keyframes-horizontal var(--duration) ease-in-out 0s infinite alternate;
}

.rotation-animation-vertical {
  --duration: 1s;
  animation: rotation-keyframes-vertical var(--duration) ease-in-out 0s infinite alternate;
}

@keyframes rotation-keyframes-horizontal {
  0% { transform: translateX(0); }
  100% { transform: translateX(-100%); }
}

@keyframes rotation-keyframes-vertical {
  0% { transform: translateY(0); }
  100% { transform: translateY(-100%); }
}
</style>