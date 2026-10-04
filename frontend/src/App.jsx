import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LoginPage from './pages/LoginPage/LoginPage'

/**
 * Point d'entrée du routage de l'application.
 * Pour l'instant seule la page de connexion existe : la racine y redirige.
 */
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        {/* Toute autre adresse renvoie vers la connexion en attendant les autres pages */}
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
