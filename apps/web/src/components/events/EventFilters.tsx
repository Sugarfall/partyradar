'use client'

import { useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import type { EventType } from '@partyradar/shared'
import { EVENT_TYPE_LABELS } from '@partyradar/shared'

interface Filters {
  type?: EventType
  search?: string
  showFree?: boolean
}

interface EventFiltersProps {
  filters: Filters
  onChange: (f: Filters) => void
}

const eventTypes: EventType[] = ['HOME_PARTY', 'CLUB_NIGHT', 'CONCERT']

const typeColors: Record<EventType, string> = {
  HOME_PARTY: 'border-pink-500 text-pink-400 bg-pink-500/10',
  CLUB_NIGHT: 'border-purple-500 text-purple-400 bg-purple-500/10',
  CONCERT: 'border-blue-500 text-blue-400 bg-blue-500/10',
}

export function EventFilters({ filters, onChange }: EventFiltersProps) {
  const [searchValue, setSearchValue] = useState(filters.search ?? '')

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    onChange({ ...filters, search: searchValue || undefined })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Search bar */}
      <form onSubmit={handleSearchSubmit} className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
        <input
          type="text"
          placeholder="Search events..."
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          className="input-field pl-9 pr-4"
        />
        {searchValue && (
          <button
            type="button"
            onClick={() => { setSearchValue(''); onChange({ ...filters, search: undefined }) }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
          >
            <X size={14} />
          </button>
        )}
      </form>

      {/* Type tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={() => onChange({ ...filters, type: undefined })}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            !filters.type ? 'border-accent text-accent bg-accent/10' : 'border-border text-zinc-400 hover:border-zinc-600'
          }`}
        >
          All Events
        </button>
        {eventTypes.map((type) => (
          <button
            key={type}
            onClick={() => onChange({ ...filters, type: filters.type === type ? undefined : type })}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              filters.type === type ? typeColors[type] : 'border-border text-zinc-400 hover:border-zinc-600'
            }`}
          >
            {EVENT_TYPE_LABELS[type]}
          </button>
        ))}
        <button
          onClick={() => onChange({ ...filters, showFree: !filters.showFree })}
          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
            filters.showFree ? 'border-green-500 text-green-400 bg-green-500/10' : 'border-border text-zinc-400 hover:border-zinc-600'
          }`}
        >
          Free Only
        </button>
      </div>
    </div>
  )
}
