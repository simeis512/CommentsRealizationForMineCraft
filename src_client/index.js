import '@babel/polyfill'
import vuetify from './plugins/vuetify'
import Vue from 'vue'
import MainComponent from './vue/main.vue'

const app = new Vue({
  el: '#app',
  components: { MainComponent },
  vuetify
})
