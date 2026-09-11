import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Link, Routes, Route } from 'react-router-dom'
import { AppProvider, useApp, normalizeState } from '../../src/context/AppContext'
import GradePage from '../../src/pages/GradePage'
import { seedDocuments, readDocuments, emitSnapshot, setFailWrites } from './grade-firestore'

seedDocuments({
  'appData/teacher-test': normalizeState({
    classes: [
      { id: 'class-a', name: '테스트 A반', days: 'mon-fri' },
      { id: 'class-b', name: '테스트 B반', days: 'mon-fri' },
    ],
    students: [
      { id: 'student-a', name: '테스트학생가', classId: 'class-a', active: true },
      { id: 'student-b', name: '테스트학생나', classId: 'class-a', active: true },
      { id: 'student-c', name: '테스트학생다', classId: 'class-b', active: true },
    ],
  }),
  'homeworkData/teacher-test': { homeworks: [], clientUpdatedAt: 1 },
})

function TestApp() {
  const app = useApp()
  window.gradeTest = { app, readDocuments, emitSnapshot, setFailWrites }
  if (app.loading) return <p>Loading test data...</p>
  return (
    <MemoryRouter initialEntries={['/grades']}>
      <nav><Link to="/grades">성적 페이지</Link> <Link to="/other">다른 페이지</Link></nav>
      <Routes>
        <Route path="/grades" element={<GradePage />} />
        <Route path="/other" element={<p>다른 페이지입니다.</p>} />
      </Routes>
    </MemoryRouter>
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode><AppProvider uid="teacher-test"><TestApp /></AppProvider></StrictMode>
)
