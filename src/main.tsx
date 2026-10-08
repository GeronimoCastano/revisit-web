import { render } from 'preact'
import { refreshLibrary } from './model/app'
import { progress } from './model/progress'
import './styles.css'
import { App } from './ui/App'

render(<App />, document.getElementById('app')!)

void refreshLibrary()

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refreshLibrary()
  else progress.saveNow()
})

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
