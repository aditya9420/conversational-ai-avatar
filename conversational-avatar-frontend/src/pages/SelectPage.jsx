import { useNavigate } from 'react-router-dom'
import './SelectPage.css'

export default function SelectPage() {
  const navigate = useNavigate()
  const user = JSON.parse(sessionStorage.getItem('user') || '{}')
  const name = user.name || 'there'

  return (
    <div className="select-page">
      <div className="select-bg" />
      <div className="select-bg-glow" />

      <div className="select-content">
        {/* Header */}
        <div className="select-header">
          <p className="select-greeting">Welcome, {name} 👋</p>
          <h1 className="select-title">Choose your avatar</h1>
          <p className="select-subtitle">Pick who you'd like to have a conversation with</p>
        </div>

        {/* Cards */}
        <div className="avatar-cards">

          {/* ── Eve ── */}
          <div className="avatar-card eve" onClick={() => navigate('/chat/eve')}>
            <div className="eve-thumb-wrap">
              <img src="/avatar.png" alt="Eve" />
            </div>
            <h2 className="card-name">Eve</h2>
            <p className="card-desc">
              Warm, expressive & creative.<br />Your go-to companion for ideas and conversation.
            </p>
            <button id="chat-eve-btn" className="card-btn" type="button">
              Chat with Eve →
            </button>
          </div>

          {/* ── Steve ── */}
          <div className="avatar-card steve" onClick={() => navigate('/chat/steve')}>
            <div className="steve-emoji-wrap" />
            <h2 className="card-name">Steve</h2>
            <p className="card-desc">
              Logical, precise & knowledgeable.<br />Your expert for analysis and problem-solving.
            </p>
            <button id="chat-steve-btn" className="card-btn" type="button">
              Chat with Steve →
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
