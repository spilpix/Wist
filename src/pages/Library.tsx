import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownAZ, ArrowUpAZ, LayoutGrid, Library as LibraryIcon, List, Plus, Search } from 'lucide-react'
import AddTitleModal from '../components/AddTitleModal'
import TitleCard from '../components/TitleCard'
import TitleRow from '../components/TitleRow'
import EmptyState from '../components/ui/EmptyState'
import Spinner from '../components/ui/Spinner'
import { useLibraryStore } from '../store/libraryStore'
import { TITLE_STATUSES, TITLE_TYPES, type TitleStatus, type TitleType } from '../types/models'
import { useI18n } from '../i18n'

const SORTS = ['date_added', 'title', 'rating', 'progress', 'last_watched'] as const

export default function Library() {
  const { t } = useI18n()
  const { titles, loading, filters, view, setFilters, setView, load } = useLibraryStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showAdd, setShowAdd] = useState(false)

  // command palette deep link: /library?add=1 opens the add-title modal
  useEffect(() => {
    if (searchParams.get('add') === '1') {
      setShowAdd(true)
      searchParams.delete('add')
      setSearchParams(searchParams, { replace: true })
    }
  }, [searchParams, setSearchParams])
  const [genres, setGenres] = useState<string[]>([])
  const [years, setYears] = useState<number[]>([])

  // sidebar links set ?status= (My Lists) and ?type= (Books)
  useEffect(() => {
    const status = (searchParams.get('status') as TitleStatus | null) ?? 'all'
    const type = (searchParams.get('type') as TitleType | null) ?? 'all'
    setFilters({ status, type })
  }, [searchParams]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    window.wist.titles.genres().then(setGenres)
    window.wist.titles.years().then(setYears)
  }, [titles.length])

  const heading = useMemo(() => {
    if (searchParams.get('type') === 'book') return t('nav.books')
    const status = searchParams.get('status') as TitleStatus | null
    return status && TITLE_STATUSES.includes(status) ? t(`status.${status}`) : t('nav.library')
  }, [searchParams, t])

  return (
    <div className="page">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="page-title !mb-0">{heading}</h1>
        <button className="btn-accent" onClick={() => setShowAdd(true)}>
          <Plus size={16} /> {t('lib.addTitle')}
        </button>
      </div>

      {/* filter bar */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            className="input !w-56 !pl-8"
            placeholder={t('lib.search')}
            value={filters.search ?? ''}
            onChange={(e) => setFilters({ search: e.target.value || undefined })}
          />
        </div>
        <select className="select" value={filters.type ?? 'all'} onChange={(e) => setFilters({ type: e.target.value as TitleType | 'all' })}>
          <option value="all">{t('lib.allTypes')}</option>
          {TITLE_TYPES.map((v) => (
            <option key={v} value={v}>{t(`type.${v}`)}</option>
          ))}
        </select>
        <select className="select" value={filters.status ?? 'all'} onChange={(e) => setFilters({ status: e.target.value as TitleStatus | 'all' })}>
          <option value="all">{t('lib.allStatuses')}</option>
          {TITLE_STATUSES.map((v) => (
            <option key={v} value={v}>{t(`status.${v}`)}</option>
          ))}
        </select>
        <select className="select" value={filters.genre ?? ''} onChange={(e) => setFilters({ genre: e.target.value || undefined })}>
          <option value="">{t('lib.allGenres')}</option>
          {genres.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          className="select"
          value={filters.year ?? ''}
          onChange={(e) => setFilters({ year: e.target.value ? parseInt(e.target.value, 10) : undefined })}
        >
          <option value="">{t('lib.anyYear')}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <select
          className="select"
          value={filters.minRating ?? ''}
          onChange={(e) => setFilters({ minRating: e.target.value ? parseInt(e.target.value, 10) : undefined })}
        >
          <option value="">{t('lib.anyRating')}</option>
          {[9, 8, 7, 6, 5].map((r) => (
            <option key={r} value={r}>{t('lib.ratingPlus', { n: r })}</option>
          ))}
        </select>

        <div className="ml-auto flex items-center gap-2">
          <select className="select" value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value as typeof filters.sort })}>
            {SORTS.map((s) => (
              <option key={s} value={s}>{t(`lib.sort.${s}`)}</option>
            ))}
          </select>
          <button
            className="btn-ghost !px-2.5"
            title={t('lib.sortDir')}
            onClick={() => setFilters({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' })}
          >
            {filters.sortDir === 'asc' ? <ArrowUpAZ size={15} /> : <ArrowDownAZ size={15} />}
          </button>
          <div className="flex overflow-hidden rounded-lg border border-edge">
            <button
              className={`p-2 transition-colors ${view === 'grid' ? 'bg-accent/20 text-accent-bright' : 'text-zinc-500 hover:text-zinc-300'}`}
              onClick={() => setView('grid')}
            >
              <LayoutGrid size={15} />
            </button>
            <button
              className={`p-2 transition-colors ${view === 'list' ? 'bg-accent/20 text-accent-bright' : 'text-zinc-500 hover:text-zinc-300'}`}
              onClick={() => setView('list')}
            >
              <List size={15} />
            </button>
          </div>
        </div>
      </div>

      {loading && !titles.length ? (
        <Spinner />
      ) : !titles.length ? (
        <EmptyState
          icon={LibraryIcon}
          title={t('lib.emptyTitle')}
          subtitle={t('lib.emptySubtitle')}
          action={
            <button className="btn-accent" onClick={() => setShowAdd(true)}>
              <Plus size={16} /> {t('lib.addFirst')}
            </button>
          }
        />
      ) : view === 'grid' ? (
        <div className="grid grid-cols-3 gap-x-5 gap-y-7 lg:grid-cols-4 xl:grid-cols-5">
          {titles.map((t) => (
            <TitleCard key={t.id} title={t} />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {titles.map((t) => (
            <TitleRow key={t.id} title={t} />
          ))}
        </div>
      )}

      {showAdd && <AddTitleModal onClose={() => setShowAdd(false)} onSaved={() => load()} />}
    </div>
  )
}
