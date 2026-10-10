import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage/LoginPage'
import DashboardPage from './pages/DashboardPage/DashboardPage'
import RecuPage from './pages/RecuPage/RecuPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/tableau-de-bord" element={<DashboardPage />} />
        {/* Reçu de paiement imprimable (ouvert dans un nouvel onglet depuis la rubrique Paiements) */}
        <Route path="/recus/:id" element={<RecuPage />} />
        <Route path="*" element={<Navigate to="/tableau-de-bord" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
