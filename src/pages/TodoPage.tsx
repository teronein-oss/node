import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Plus, StickyNote, Trash2 } from 'lucide-react'
import { useApp } from '../context/AppContext'
import type { TodoItem } from '../types'
import { fmtDate } from '../utils/helpers'

function MemoRow({ item }: { item: TodoItem }) {
  const { dispatch } = useApp()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.title)

  const save = () => {
    const title = draft.trim()
    if (!title) {
      setDraft(item.title)
    } else if (title !== item.title) {
      dispatch({ type: 'UPDATE_TODO', payload: { id: item.id, title } })
    }
    setEditing(false)
  }

  return (
    <div className="group flex min-h-10 items-start gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
      <button
        type="button"
        aria-label={item.completed ? '메모 미완료로 변경' : '메모 완료'}
        onClick={() => dispatch({ type: 'TOGGLE_TODO', payload: item.id })}
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          item.completed
            ? 'border-blue-500 bg-blue-500 text-white'
            : 'border-slate-300 bg-white text-transparent hover:border-blue-400'
        }`}
      >
        <Check size={11} strokeWidth={3} />
      </button>

      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onBlur={save}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) save()
              if (event.key === 'Escape') {
                setDraft(item.title)
                setEditing(false)
              }
            }}
            className="w-full border-0 bg-transparent p-0 text-sm text-slate-800 outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={`block w-full text-left text-sm leading-5 ${item.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}
          >
            {item.title}
          </button>
        )}
        {item.memo && <p className={`mt-0.5 whitespace-pre-wrap text-xs ${item.completed ? 'text-slate-300' : 'text-slate-400'}`}>{item.memo}</p>}
      </div>

      <button
        type="button"
        aria-label="메모 삭제"
        onClick={() => dispatch({ type: 'REMOVE_TODO', payload: item.id })}
        className="shrink-0 rounded p-1 text-slate-300 transition-all hover:bg-red-50 hover:text-red-500 sm:opacity-0 sm:group-hover:opacity-100"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

export default function TodoPage() {
  const { state, dispatch } = useApp()
  const [text, setText] = useState('')
  const [completedOpen, setCompletedOpen] = useState(false)

  const memos = useMemo(
    () => [...(state.todos ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [state.todos]
  )
  const activeMemos = memos.filter(item => !item.completed)
  const completedMemos = memos.filter(item => item.completed)

  const addMemo = () => {
    const title = text.trim()
    if (!title) return
    dispatch({
      type: 'ADD_TODO',
      payload: { title, date: fmtDate(new Date()), priority: 'none' },
    })
    setText('')
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-16">
      <header className="notion-page-heading border-b border-slate-200 pb-5 pt-2">
        <div className="flex items-center gap-3">
          <div className="notion-page-icon flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-500">
            <StickyNote size={21} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">메모</h1>
            <p className="mt-1 text-sm text-slate-500">기억할 일을 적고 체크박스로 완료하세요</p>
          </div>
        </div>
      </header>

      <section className="rounded-lg border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300 bg-white" />
            <input
              value={text}
              onChange={event => setText(event.target.value)}
              onKeyDown={event => {
                if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return
                event.preventDefault()
                addMemo()
              }}
              placeholder="메모를 입력하고 Enter"
              className="min-w-0 flex-1 border-0 bg-transparent px-1 py-1 text-sm text-slate-800 outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={addMemo}
              disabled={!text.trim()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 disabled:opacity-30"
            >
              <Plus size={14} /> 추가
            </button>
          </div>
        </div>

        <div className="p-3">
          {activeMemos.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <StickyNote size={24} className="mx-auto text-slate-200" />
              <p className="mt-3 text-sm text-slate-400">작성된 메모가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {activeMemos.map(item => <MemoRow key={item.id} item={item} />)}
            </div>
          )}

          {completedMemos.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2">
              <button
                type="button"
                onClick={() => setCompletedOpen(open => !open)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                {completedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                완료된 메모 {completedMemos.length}
              </button>
              {completedOpen && (
                <div className="mt-1 space-y-0.5">
                  {completedMemos.map(item => <MemoRow key={item.id} item={item} />)}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <p className="px-1 text-xs text-slate-400">팁: 메모 문구를 누르면 바로 수정할 수 있습니다.</p>
    </div>
  )
}
