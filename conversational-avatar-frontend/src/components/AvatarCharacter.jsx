import { useEffect, useRef, useState } from 'react'
import './AvatarCharacter.css'

/**
 * AvatarCharacter
 * ---------------
 * Uses the actual sketch image provided by the user.
 * Animations: gentle idle float, subtle head bob, hand sway via CSS transforms.
 * When talking: faster bob + talking indicator.
 */
export default function AvatarCharacter({ isTalking = false }) {
  return (
    <div className={`avatar-img-wrapper${isTalking ? ' is-talking' : ''}`}>
      <img
        src="/avatar.png"
        alt="Conversational avatar"
        className="avatar-img"
        draggable={false}
      />
    </div>
  )
}
