'use client'

import { ThumbsUp, ThumbsDown, Clock, X } from 'lucide-react'
import type { CelebritySighting } from '@partyradar/shared'

interface SightingCardProps {
  sighting: CelebritySighting
  onVote: (id: string, isUpvote: boolean) => Promise<void>
  onClose?: () => void
}

export function SightingCard({ sighting, onVote, onClose }: SightingCardProps) {
  const remaining = new Date(sighting.expiresAt).getTime() - Date.now()
  const hours = Math.floor(remaining / 3600000)
  const mins = Math.floor((remaining % 3600000) / 60000)
  const expiryLabel = hours > 0 ? `${hours}h ${mins}m left` : `${mins}m left`

  return (
    <div className="flex gap-3">
      {sighting.photoUrl && (
        <img src={sighting.photoUrl} alt="" className="w-16 h-16 rounded-xl object-cover shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <div>
            <h3 className="font-semibold text-party-gold">{sighting.celebrity}</h3>
            <p className="text-xs text-zinc-500 flex items-center gap-1">
              <Clock size={10} />
              {expiryLabel} · spotted by @{sighting.reporter.username}
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} className="p-1 rounded hover:bg-bg-elevated text-zinc-500">
              <X size={14} />
            </button>
          )}
        </div>

        {sighting.description && (
          <p className="text-sm text-zinc-400 mb-2 line-clamp-2">{sighting.description}</p>
        )}

        <div className="flex items-center gap-3">
          <button
            onClick={() => onVote(sighting.id, true)}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
              sighting.userVote === 'up'
                ? 'bg-green-500/20 text-green-400 border-green-500/40'
                : 'border-border text-zinc-400 hover:border-green-500/40 hover:text-green-400'
            }`}
          >
            <ThumbsUp size={12} />
            {sighting.upvotes}
          </button>
          <button
            onClick={() => onVote(sighting.id, false)}
            className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
              sighting.userVote === 'down'
                ? 'bg-red-500/20 text-red-400 border-red-500/40'
                : 'border-border text-zinc-400 hover:border-red-500/40 hover:text-red-400'
            }`}
          >
            <ThumbsDown size={12} />
            {sighting.downvotes}
          </button>
        </div>
      </div>
    </div>
  )
}
