import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage/LoginPage'
import DashboardPage from './pages/DashboardPage/DashboardPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/tableau-de-bord" element={<DashboardPage />} />
        <Route path="*" element={<Navigate to="/tableau-de-bord" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
