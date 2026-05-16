import { useState, useEffect, useRef } from 'react'
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useNavigate, Link, useLocation } from 'react-router-dom'
import { ChevronDown, ChevronRight, Plus, Trash2, Pencil, Check, X, Users, GraduationCap, Loader2, Clock, Settings } from 'lucide-react'
import { genId } from '../utils/helpers'
import type { Class } from '../types'

const DAYS_OPTIONS: { value: Class['days']; label: string }[] = [
  { value: 'mon-fri', label: '월·금' },
  { value: 'tue-thu', label: '화·목' },
  { value: 'wed-sat', label: '수·토' },
  { value: 'mon-wed-fri', label: '월·수·금' },
]

interface TeacherInfo { uid: string; displayName: string; role: string }
interface ClassData { id: string; name: string; days: string }
interface StudentData { id: string; name: string; classId: string; active: boolean }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AppData = Record<string, any>

function AdminTabs() {
  const { pathname } = useLocation()
  return (
    <div className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
      <Link
        to="/admin"
        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
          ${pathname === '/admin' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
      >
        <Clock size={14} />가입 관리
      </Link>
      <Link
        to="/admin/manage"
        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
          ${pathname === '/admin/manage' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
      >
        <Settings size={14} />계정 관리
      </Link>
    </div>
  )
}

export default function AdminManagePage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()

  const [teachers, setTeachers] = useState<TeacherInfo[]>([])
  const [selectedUid, setSelectedUid] = useState<string | null>(null)
  const [selectedName, setSelectedName] = useState('')
  const [classes, setClasses] = useState<ClassData[]>([])
  const [students, setStudents] = useState<StudentData[]>([])
  const [appDataRef, setAppDataRef] = useState<AppData>({})
  const [loadingTeacher, setLoadingTeacher] = useState(false)
  const [savingMsg, setSavingMsg] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isAdmin) { navigate('/'); return }
    getDocs(collection(db, 'registrations')).then(snap => {
      const list: TeacherInfo[] = []
      snap.forEach(d => {
        const data = d.data()
        if (data.status === 'approved' && (data.role === '선생님' || data.role === '관리자')) {
          list.push({ uid: d.id, displayName: data.displayName, role: data.role })
        }
      })
      setTeachers(list.sort((a, b) => a.displayName.localeCompare(b.displayName, 'ko')))
    })
  }, [isAdmin, navigate])

  const selectTeacher = async (t: TeacherInfo) => {
    setSelectedUid(t.uid)
    setSelectedName(t.displayName)
    setLoadingTeacher(true)
    const snap = await getDoc(doc(db, 'appData', t.uid))
    const data: AppData = snap.exists() ? snap.data() : {}
    setAppDataRef(data)
    setClasses(data.classes ?? [])
    setStudents(data.students ?? [])
    setLoadingTeacher(false)
  }

  // ── 저장 (디바운스) ──────────────────────────────────────────────────────
  const scheduleSave = (newClasses: ClassData[], newStudents: StudentData[]) => {
    if (!selectedUid) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSavingMsg('저장 중...')
    saveTimer.current = setTimeout(async () => {
      await setDoc(doc(db, 'appData', selectedUid), { ...appDataRef, classes: newClasses, students: newStudents })
      setSavingMsg('저장됨')
      setTimeout(() => setSavingMsg(null), 1500)
    }, 400)
  }

  // ── 반 CRUD ──────────────────────────────────────────────────────────────
  const addClass = (name: string, days: Class['days']) => {
    const updated = [...classes, { id: genId(), name, days }]
    setClasses(updated)
    scheduleSave(updated, students)
  }
  const renameClass = (id: string, name: string) => {
    const updated = classes.map(c => c.id === id ? { ...c, name } : c)
    setClasses(updated)
    scheduleSave(updated, students)
  }
  const deleteClass = (id: string) => {
    const updatedClasses = classes.filter(c => c.id !== id)
    const updatedStudents = students.map(s => s.classId === id ? { ...s, active: false } : s)
    setClasses(updatedClasses)
    setStudents(updatedStudents)
    scheduleSave(updatedClasses, updatedStudents)
  }

  // ── 학생 CRUD ────────────────────────────────────────────────────────────
  const addStudent = (name: string, classId: string) => {
    const updated = [...students, { id: genId(), name, classId, active: true }]
    setStudents(updated)
    scheduleSave(classes, updated)
  }
  const renameStudent = (id: string, name: string) => {
    const updated = students.map(s => s.id === id ? { ...s, name } : s)
    setStudents(updated)
    scheduleSave(classes, updated)
  }
  const deleteStudent = (id: string) => {
    const updated = students.map(s => s.id === id ? { ...s, active: false } : s)
    setStudents(updated)
    scheduleSave(classes, updated)
  }

  if (!isAdmin) return null

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-800">관리자 패널</h1>
        <AdminTabs />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-700">계정 관리 — 반·학생 편집</h2>
        {savingMsg && (
          <span className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full
            ${savingMsg === '저장 중...' ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
            {savingMsg === '저장 중...' && <Loader2 size={12} className="animate-spin" />}
            {savingMsg === '저장됨' && <Check size={12} />}
            {savingMsg}
          </span>
        )}
      </div>

      <div className="flex gap-5 items-start">
        {/* ── 선생님 목록 ── */}
        <div className="w-48 shrink-0 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center gap-2">
            <GraduationCap size={14} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">선생님</span>
          </div>
          {teachers.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">없음</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {teachers.map(t => (
                <button
                  key={t.uid}
                  onClick={() => selectTeacher(t)}
                  className={`w-full text-left px-4 py-3 text-sm transition-colors
                    ${selectedUid === t.uid
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <div>{t.displayName}</div>
                  <div className="text-xs text-slate-400 font-normal">{t.role}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── 우측 패널 ── */}
        <div className="flex-1 min-w-0">
          {!selectedUid ? (
            <div className="bg-white rounded-xl border border-slate-200 flex items-center justify-center py-20 text-sm text-slate-400">
              왼쪽에서 선생님을 선택하세요
            </div>
          ) : loadingTeacher ? (
            <div className="bg-white rounded-xl border border-slate-200 flex items-center justify-center py-20">
              <Loader2 size={22} className="animate-spin text-blue-400" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* 반 추가 폼 */}
              <AddClassForm onAdd={addClass} />

              {/* 반별 카드 */}
              {classes.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 py-12 text-center text-sm text-slate-400">
                  등록된 반이 없습니다
                </div>
              ) : classes.map(cls => (
                <ClassCard
                  key={cls.id}
                  cls={cls}
                  students={students.filter(s => s.classId === cls.id && s.active)}
                  teacherName={selectedName}
                  onRenameClass={renameClass}
                  onDeleteClass={deleteClass}
                  onAddStudent={addStudent}
                  onRenameStudent={renameStudent}
                  onDeleteStudent={deleteStudent}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 반 추가 폼 ──────────────────────────────────────────────────────────────
function AddClassForm({ onAdd }: { onAdd: (name: string, days: Class['days']) => void }) {
  const [name, setName] = useState('')
  const [days, setDays] = useState<Class['days']>('mon-fri')
  const [open, setOpen] = useState(false)

  const submit = () => {
    if (!name.trim()) return
    onAdd(name.trim(), days)
    setName('')
    setDays('mon-fri')
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 transition-colors"
      >
        <Plus size={15} />반 추가
      </button>
    )
  }

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap gap-3 items-end">
      <div>
        <label className="text-xs text-slate-500 mb-1 block">반 이름</label>
        <input
          autoFocus
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="예: 고3 S반"
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-300 w-44"
        />
      </div>
      <div>
        <label className="text-xs text-slate-500 mb-1 block">수업 요일</label>
        <div className="flex gap-1">
          {DAYS_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => setDays(o.value)}
              className={`px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors
                ${days === o.value ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={submit} disabled={!name.trim()} className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-40">추가</button>
        <button onClick={() => setOpen(false)} className="px-4 py-2 bg-white text-slate-600 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">취소</button>
      </div>
    </div>
  )
}

// ── 반 카드 ─────────────────────────────────────────────────────────────────
function ClassCard({
  cls, students, teacherName,
  onRenameClass, onDeleteClass,
  onAddStudent, onRenameStudent, onDeleteStudent,
}: {
  cls: ClassData
  students: StudentData[]
  teacherName: string
  onRenameClass: (id: string, name: string) => void
  onDeleteClass: (id: string) => void
  onAddStudent: (name: string, classId: string) => void
  onRenameStudent: (id: string, name: string) => void
  onDeleteStudent: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(cls.name)
  const nameRef = useRef<HTMLInputElement>(null)
  const [addingStudent, setAddingStudent] = useState(false)
  const [newStudentName, setNewStudentName] = useState('')
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const [editingStudentName, setEditingStudentName] = useState('')
  const studentInputRef = useRef<HTMLInputElement>(null)
  const daysLabel = DAYS_OPTIONS.find(o => o.value === cls.days)?.label ?? cls.days

  const commitClassName = () => {
    const trimmed = nameVal.trim()
    if (trimmed && trimmed !== cls.name) onRenameClass(cls.id, trimmed)
    setEditingName(false)
  }

  const startEditStudent = (s: StudentData) => {
    setEditingStudentId(s.id)
    setEditingStudentName(s.name)
    setTimeout(() => studentInputRef.current?.select(), 0)
  }
  const commitStudent = () => {
    if (!editingStudentId) return
    const trimmed = editingStudentName.trim()
    if (trimmed) onRenameStudent(editingStudentId, trimmed)
    setEditingStudentId(null)
  }

  const submitNewStudent = () => {
    const trimmed = newStudentName.trim()
    if (!trimmed) return
    onAddStudent(trimmed, cls.id)
    setNewStudentName('')
  }

  const handleDeleteClass = () => {
    if (!confirm(`"${cls.name}" 반을 삭제하면 소속 학생 ${students.length}명이 비활성화됩니다.\n(${teacherName} 계정에서 삭제됩니다)`)) return
    onDeleteClass(cls.id)
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      {/* 반 헤더 */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-slate-100 group">
        <button onClick={() => setExpanded(v => !v)} className="text-slate-400 hover:text-slate-600 shrink-0">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>

        {editingName ? (
          <input
            ref={nameRef}
            autoFocus
            value={nameVal}
            onChange={e => setNameVal(e.target.value)}
            onBlur={commitClassName}
            onKeyDown={e => { if (e.key === 'Enter') commitClassName(); if (e.key === 'Escape') { setNameVal(cls.name); setEditingName(false) } }}
            className="flex-1 border border-blue-300 rounded-lg px-2 py-1 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-200"
          />
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="font-semibold text-slate-800">{cls.name}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 shrink-0">{daysLabel}</span>
            <button
              onClick={() => { setEditingName(true); setTimeout(() => nameRef.current?.select(), 0) }}
              className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-blue-500 rounded transition-colors shrink-0"
            >
              <Pencil size={13} />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0 ml-auto">
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Users size={12} />{students.length}명
          </span>
          <button
            onClick={handleDeleteClass}
            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* 학생 목록 */}
      {expanded && (
        <div>
          {students.length === 0 && !addingStudent && (
            <p className="px-5 py-3 text-xs text-slate-400">학생 없음</p>
          )}
          <div className="divide-y divide-slate-50">
            {students.map(s => (
              <div key={s.id} className="flex items-center gap-3 px-5 py-2.5 group/row">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-200 shrink-0 ml-2" />
                {editingStudentId === s.id ? (
                  <input
                    ref={studentInputRef}
                    value={editingStudentName}
                    onChange={e => setEditingStudentName(e.target.value)}
                    onBlur={commitStudent}
                    onKeyDown={e => { if (e.key === 'Enter') commitStudent(); if (e.key === 'Escape') setEditingStudentId(null) }}
                    className="flex-1 border border-blue-300 rounded-lg px-2 py-1 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-200"
                  />
                ) : (
                  <span className="flex-1 text-sm text-slate-700">{s.name}</span>
                )}
                <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
                  <button onClick={() => startEditStudent(s)} className="p-1 text-slate-300 hover:text-blue-500 rounded transition-colors">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => onDeleteStudent(s.id)} className="p-1 text-slate-300 hover:text-red-500 rounded transition-colors">
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 학생 추가 */}
          <div className="px-5 py-3 border-t border-slate-50">
            {addingStudent ? (
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-300 shrink-0 ml-2" />
                <input
                  autoFocus
                  value={newStudentName}
                  onChange={e => setNewStudentName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { submitNewStudent() }
                    if (e.key === 'Escape') { setAddingStudent(false); setNewStudentName('') }
                  }}
                  placeholder="학생 이름 입력 후 Enter"
                  className="flex-1 border border-blue-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-200"
                />
                <button onClick={submitNewStudent} className="p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  <Check size={13} />
                </button>
                <button onClick={() => { setAddingStudent(false); setNewStudentName('') }} className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition-colors">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAddingStudent(true)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-blue-600 transition-colors"
              >
                <Plus size={13} />학생 추가
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
