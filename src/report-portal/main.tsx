import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './report.css'
import StudentReportPage from './StudentReportPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StudentReportPage />
  </StrictMode>,
)
