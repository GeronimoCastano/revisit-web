import { useEffect, useState } from 'preact/hooks'
import { booklet, courses, drivingMode, hasScanned, importPicked, playerRoute, showCoursePicker, showLessonList, tab } from '../model/app'
import { pickedFromDrop } from '../storage/importer'
import { ImportInputs } from './common'
import { LearnView } from './Learn'
import { MeView } from './Me'
import {
  CompletionBanner,
  CoursePicker,
  DrivingMode,
  ImportBanner,
  LessonList,
  MessageBanner,
  MiniPlayer,
  TabBar,
  WelcomeView,
} from './Overlays'
import { LessonPlayer } from './Player'
import { BookletViewer, ReadingPlayer, ReadingTab } from './Reading'

export function App() {
  const dragging = useDropImport()
  const empty = hasScanned.value && courses.value.length === 0
  const overlayOpen = !!playerRoute.value || !!booklet.value || showCoursePicker.value || !!showLessonList.value

  // Keep the page behind a full-screen overlay from scrolling.
  useEffect(() => {
    document.documentElement.style.overflow = overlayOpen ? 'hidden' : ''
  }, [overlayOpen])

  return (
    <div class="app">
      <ImportInputs />
      {!hasScanned.value ? null : empty ? (
        <WelcomeView />
      ) : (
        <>
          <div aria-hidden={overlayOpen}>
            {tab.value === 'learn' && <LearnView />}
            {tab.value === 'reading' && <ReadingTab />}
            {tab.value === 'me' && <MeView />}
          </div>
          <div class="bottom">
            <MiniPlayer />
            <TabBar />
          </div>
        </>
      )}
      {playerRoute.value === 'lesson' && <LessonPlayer />}
      {playerRoute.value === 'reading' && <ReadingPlayer />}
      {showCoursePicker.value && <CoursePicker />}
      {showLessonList.value && <LessonList />}
      {booklet.value && <BookletViewer />}
      {drivingMode.value && <DrivingMode />}
      <CompletionBanner />
      <ImportBanner />
      <MessageBanner />
      {dragging && <div class="drop-hint">Drop a course folder to import it</div>}
    </div>
  )
}

/** Dropping folders anywhere on the page imports them. */
function useDropImport() {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    let depth = 0
    const hasFiles = (e: DragEvent) => [...(e.dataTransfer?.types ?? [])].includes('Files')
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth++
      setDragging(true)
    }
    const leave = () => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragging(false)
    }
    const over = (e: DragEvent) => hasFiles(e) && e.preventDefault()
    const drop = async (e: DragEvent) => {
      if (!hasFiles(e) || !e.dataTransfer) return
      e.preventDefault()
      depth = 0
      setDragging(false)
      await importPicked(await pickedFromDrop(e.dataTransfer))
    }
    addEventListener('dragenter', enter)
    addEventListener('dragleave', leave)
    addEventListener('dragover', over)
    addEventListener('drop', drop)
    return () => {
      removeEventListener('dragenter', enter)
      removeEventListener('dragleave', leave)
      removeEventListener('dragover', over)
      removeEventListener('drop', drop)
    }
  }, [])
  return dragging
}
