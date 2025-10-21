import React, { useState } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Dashboard from './pages/Dashboard'
import Signup from './components/Signup'
import Login from './components/Login'
import SuccessToast from './components/SuccessToast'
import './App.css'

// Main app content
const AppContent = () => {
  const { loginWithCredentials, signup, isAuthenticated } = useAuth();
  const [showSignup, setShowSignup] = useState(false);
  const [successToast, setSuccessToast] = useState({ message: '', isVisible: false });

  const showSuccess = (message) => {
    setSuccessToast({ message, isVisible: true });
  };

  const hideSuccess = () => {
    setSuccessToast({ message: '', isVisible: false });
  };

  const handleLogin = async (email, password) => {
    return await loginWithCredentials(email, password);
  };

  if (!isAuthenticated()) {
    if (showSignup) {
      return <Signup onSignup={signup} onSwitchToLogin={() => setShowSignup(false)} />;
    }
    return <Login onLogin={handleLogin} onSwitchToSignup={() => setShowSignup(true)} />;
  }

  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Dashboard showSuccess={showSuccess} />} />
        <Route path="/dashboard" element={<Dashboard showSuccess={showSuccess} />} />
      </Routes>
      <SuccessToast 
        message={successToast.message}
        isVisible={successToast.isVisible}
        onClose={hideSuccess}
      />
    </div>
  );
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </Router>
  );
}

export default App 