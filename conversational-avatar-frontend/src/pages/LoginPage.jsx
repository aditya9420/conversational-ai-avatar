import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './LoginPage.css'

const API_BASE = ''

export default function LoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const e = {}
    if (!form.email.trim())          e.email    = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email'
    if (!form.password)              e.password = 'Password is required'
    return e
  }

  const handleChange = (e) => {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
    setErrors(er => ({ ...er, [e.target.name]: '' }))
    setApiError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setLoading(true)
    try {
      const res = await fetch(`${API_BASE}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      
      if (res.status === 401) {
        setApiError('Invalid email or password')
        return
      }
      if (!res.ok) {
        setApiError('Something went wrong. Try again.')
        return
      }
      
      const user = await res.json()
      sessionStorage.setItem('user', JSON.stringify(user))
      navigate('/select')
    } catch {
      // Backend offline demo fallback
      sessionStorage.setItem('user', JSON.stringify({ name: 'Demo User', email: form.email }))
      navigate('/select')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-bg-glow" />

      <div className="login-card">
        {/* Header */}
        <div className="login-logo">
          <h1 className="login-title">Welcome back</h1>
          <p className="login-subtitle">Log in to chat with your AI avatar</p>
        </div>

        {/* API error */}
        {apiError && <div className="api-error">{apiError}</div>}

        {/* Form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="you@example.com"
              className={`form-input${errors.email ? ' error' : ''}`}
              value={form.email}
              onChange={handleChange}
              autoComplete="email"
            />
            {errors.email && <span className="form-error">{errors.email}</span>}
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder="Your password"
              className={`form-input${errors.password ? ' error' : ''}`}
              value={form.password}
              onChange={handleChange}
              autoComplete="current-password"
            />
            {errors.password && <span className="form-error">{errors.password}</span>}
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            className="login-btn"
            disabled={loading}
          >
            {loading ? 'Logging in…' : 'Log In'}
          </button>
        </form>

        <p className="login-footer">
          Don't have an account?{' '}
          <a onClick={() => navigate('/signup')}>Sign up</a>
        </p>
      </div>
    </div>
  )
}
