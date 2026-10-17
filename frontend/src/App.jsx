import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import DialogsProvider from './components/Dialogs/DialogsProvider'
import LoginPage from './pages/LoginPage/LoginPage'
import DashboardPage from './pages/DashboardPage/DashboardPage'
import RecuPage from './pages/RecuPage/RecuPage'

// Diplôme imprimable : chargé seulement quand on l'ouvre
const DiplomePage = lazy(() => import('./pages/DiplomePage/DiplomePage'))

function App() {
  return (
    <BrowserRouter>
      {/* Confirmations et alertes (fenêtres modales) disponibles sur toutes les pages */}
      <DialogsProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/tableau-de-bord" element={<DashboardPage />} />
          {/* Reçus imprimables (nouvel onglet) : mensualité, ou frais d'inscription */}
          <Route path="/recus/:id" element={<RecuPage />} />
          <Route path="/recus/inscription/:id" element={<RecuPage type="inscription" />} />
          <Route path="/diplomes/:id" element={<Suspense fallback={null}><DiplomePage /></Suspense>} />
          <Route path="*" element={<Navigate to="/tableau-de-bord" replace />} />
        </Routes>
      </DialogsProvider>
    </BrowserRouter>
  )
}

export default App
