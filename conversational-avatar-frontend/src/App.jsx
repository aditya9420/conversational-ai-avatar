import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import SignupPage from './pages/SignupPage'
import LoginPage  from './pages/LoginPage'
import SelectPage from './pages/SelectPage'
import EvePage    from './pages/EvePage'
import StevePage  from './pages/StevePage'
import './index.css'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Sign-up is the entry point */}
        <Route path="/"         element={<Navigate to="/signup" replace />} />
        <Route path="/signup"   element={<SignupPage />} />
        <Route path="/login"    element={<LoginPage />} />
        <Route path="/select"   element={<SelectPage />} />
        <Route path="/chat/eve"   element={<EvePage />} />
        <Route path="/chat/steve" element={<StevePage />} />
        {/* fallback */}
        <Route path="*" element={<Navigate to="/signup" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
