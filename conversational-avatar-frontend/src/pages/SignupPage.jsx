import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './SignupPage.css'

const API_BASE = ''

export default function SignupPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [apiError, setApiError] = useState('')
  const [loading, setLoading] = useState(false)

  const validate = () => {
    const e = {}
    if (!form.name.trim())           e.name     = 'Name is required'
    if (!form.email.trim())          e.email    = 'Email is required'
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter a valid email'
    if (!form.password)              e.password = 'Password is required'
    else if (form.password.length < 6) e.password = 'At least 6 characters'
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
      const res = await fetch(`${API_BASE}/users/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (res.status === 409) { setApiError('Email already registered. Please log in.'); return }
      if (!res.ok) { setApiError('Something went wrong. Try again.'); return }
      const user = await res.json()
      // Store user in session storage then go to select page
      sessionStorage.setItem('user', JSON.stringify(user))
      navigate('/select')
    } catch {
      // Backend might not be running — still allow demo navigation
      sessionStorage.setItem('user', JSON.stringify({ name: form.name, email: form.email }))
      navigate('/select')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="signup-page">
      <div className="signup-bg" />
      <div className="signup-bg-glow" />

      <div className="signup-card">
        {/* Logo / header */}
        <div className="signup-logo">
          <h1 className="signup-title">Create your account</h1>
          <p className="signup-subtitle">Sign up to start chatting with your AI avatar</p>
        </div>

        {/* API error */}
        {apiError && <div className="api-error">{apiError}</div>}

        {/* Form */}
        <form className="signup-form" onSubmit={handleSubmit} noValidate>
          <div className="form-group">
            <label className="form-label" htmlFor="name">Full Name</label>
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Your name"
              className={`form-input${errors.name ? ' error' : ''}`}
              value={form.name}
              onChange={handleChange}
              autoComplete="name"
            />
            {errors.name && <span className="form-error">{errors.name}</span>}
          </div>

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
              placeholder="Min. 6 characters"
              className={`form-input${errors.password ? ' error' : ''}`}
              value={form.password}
              onChange={handleChange}
              autoComplete="new-password"
            />
            {errors.password && <span className="form-error">{errors.password}</span>}
          </div>

          <button
            id="signup-submit-btn"
            type="submit"
            className="signup-btn"
            disabled={loading}
          >
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <p className="signup-footer">
          Already have an account?{' '}
          <a onClick={() => navigate('/login')}>Log in</a>
        </p>
      </div>
    </div>
  )
}
