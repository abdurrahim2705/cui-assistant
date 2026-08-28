import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import {
  loginUser,
  registerStudent,
  getStudentProfile,
  sendChat,
  addTask,
  toggleTaskStatus,
  removeTask,
  fetchAllStudents,
  updateStudentApproval,
  fetchPolicyDocs,
  updatePolicyDoc,
  addRAGDocument,
  deletePolicyDoc,
} from './api';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('cui_token') || '');
  const [userRole, setUserRole] = useState(localStorage.getItem('cui_role') || '');
  const [activeTab, setActiveTab] = useState(localStorage.getItem('cui_role') === 'admin' ? 'approvals' : 'dashboard');

  // Auth Form State
  const [isRegistering, setIsRegistering] = useState(false);
  const [regNoInput, setRegNoInput] = useState('FA24-ELC-007');
  const [passwordInput, setPasswordInput] = useState('Password123');
  const [authMsg, setAuthMsg] = useState('');
  const [authError, setAuthError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Student Dashboard State
  const [studentData, setStudentData] = useState(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCourse, setTaskCourse] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskFilter, setTaskFilter] = useState('All');
  const [taskSearch, setTaskSearch] = useState('');
  const [chatLog, setChatLog] = useState([
    { sender: 'bot', text: 'Welcome to COMSATS Assistant! Ask me anything about university rules, attendance, or tasks.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState(null);
  const chatLogRef = useRef(null);
  const [theme, setTheme] = useState(localStorage.getItem('cui_theme') || 'default');

  useEffect(() => {
    chatLogRef.current?.scrollTo({ top: chatLogRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatLog, isTyping]);

  const handleCopyMessage = async (text, index) => {
    await navigator.clipboard.writeText(text);
    setCopiedMessageIndex(index);
    setTimeout(() => setCopiedMessageIndex(null), 1600);
  };

  // Admin Dashboard State
  const [adminStudents, setAdminStudents] = useState([]);
  const [adminDocs, setAdminDocs] = useState([]);
  const [editingDocId, setEditingDocId] = useState(null);
  const [docDraftContent, setDocDraftContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [documentSearch, setDocumentSearch] = useState('');

  // Admin Ingestion Form State
  const [newDocTitle, setNewDocTitle] = useState('');
  const [newDocCategory, setNewDocCategory] = useState('General');
  const [newDocContent, setNewDocContent] = useState('');
  const [isIngesting, setIsIngesting] = useState(false);
  const [showAddDocForm, setShowAddDocForm] = useState(false);

  // Auto-logout if token exists without a valid role
  useEffect(() => {
    if (token && !userRole) {
      handleLogout();
    }
  }, [token, userRole]);

  useEffect(() => {
    if (token && userRole) {
      if (userRole === 'student') {
        loadStudentData();
      } else if (userRole === 'admin') {
        loadAdminData();
      }
    }
  }, [token, userRole]);

  const loadStudentData = async () => {
    try {
      const data = await getStudentProfile();
      setStudentData(data);
      if (data.courses?.length > 0 && !taskCourse) setTaskCourse(data.courses[0].code);
    } catch {
      handleLogout();
    } finally {
      setIsLoggingIn(false);
    }
  };

  const loadAdminData = async () => {
    try {
      const sRes = await fetchAllStudents();
      const dRes = await fetchPolicyDocs();
      setAdminStudents(sRes.students || []);
      setAdminDocs(dRes.documents || []);
    } catch {
      handleLogout();
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthMsg('');
    setIsLoggingIn(true);
    try {
      const res = await loginUser(regNoInput.trim(), passwordInput.trim());
      localStorage.setItem('cui_token', res.access_token);
      localStorage.setItem('cui_role', res.role);
      setToken(res.access_token);
      setUserRole(res.role);
      setActiveTab(res.role === 'admin' ? 'approvals' : 'dashboard');
    } catch (err) {
      setAuthError(err.response?.data?.detail || 'Login failed.');
      setIsLoggingIn(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthMsg('');
    try {
      const res = await registerStudent({
        registration_no: regNoInput.trim(),
        password: passwordInput.trim(),
      });
      setAuthMsg(res.message);
      setIsRegistering(false);
    } catch (err) {
      setAuthError(err.response?.data?.detail || 'Registration failed.');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('cui_token');
    localStorage.removeItem('cui_role');
    setToken('');
    setUserRole('');
    setStudentData(null);
    setAdminStudents([]);
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    await addTask({ title: taskTitle, task_type: 'assignment', course_code: taskCourse || null, due_date: taskDueDate || null });
    setTaskTitle('');
    setTaskDueDate('');
    loadStudentData();
  };

  const handleToggleTask = async (id, status) => {
    await toggleTaskStatus(id, status === 'completed' ? 'pending' : 'completed');
    loadStudentData();
  };

  const handleDeleteTask = async (id) => {
    await removeTask(id);
    loadStudentData();
  };

  const handleSendChat = async (e, suggestedText = '') => {
    e?.preventDefault();
    const msg = suggestedText.trim() || chatInput.trim();
    if (!msg || isTyping) return;
    setChatInput('');
    setChatLog((prev) => [...prev, { sender: 'user', text: msg }]);
    setIsTyping(true);
    try {
      const res = await sendChat(msg);
      setChatLog((prev) => [...prev, { sender: 'bot', text: res.response }]);
      loadStudentData();
    } catch {
      setChatLog((prev) => [...prev, { sender: 'bot', text: 'Error connecting to assistant.' }]);
    } finally {
      setIsTyping(false);
    }
  };

  const shortAttendanceCount = studentData?.courses?.filter((course) => Number(course.attendance_pct) < 80).length || 0;
  const upcomingDeadlineCount = studentData?.tasks?.filter((task) => {
    if (!task.due_date) return false;
    const dueDate = new Date(task.due_date.includes('T') ? task.due_date : `${task.due_date}T23:59:59`);
    const now = Date.now();
    return dueDate.getTime() >= now && dueDate.getTime() <= now + 48 * 60 * 60 * 1000;
  }).length || 0;
  const filteredTasks = studentData?.tasks?.filter((task) => {
    const matchesFilter = taskFilter === 'All' || (taskFilter === 'Completed' ? task.status === 'completed' : task.status !== 'completed');
    const searchTerm = taskSearch.trim().toLowerCase();
    const matchesSearch = !searchTerm
      || task.title?.toLowerCase().includes(searchTerm)
      || task.course_code?.toLowerCase().includes(searchTerm);
    return matchesFilter && matchesSearch;
  }) || [];
  const filteredStudents = adminStudents.filter((student) => {
    const searchTerm = studentSearch.trim().toLowerCase();
    return !searchTerm || [student.name, student.registration_no, student.department, student.status]
      .some((value) => value?.toLowerCase().includes(searchTerm));
  });
  const filteredDocuments = adminDocs.filter((document) => {
    const searchTerm = documentSearch.trim().toLowerCase();
    return !searchTerm || [document.title, document.category, document.content]
      .some((value) => value?.toLowerCase().includes(searchTerm));
  });

  const handleThemeChange = (nextTheme) => {
    setTheme(nextTheme);
    localStorage.setItem('cui_theme', nextTheme);
  };

  const handleUpdateStudentStatus = async (studentId, status) => {
    await updateStudentApproval(studentId, status);
    loadAdminData();
  };

  const handleSaveDoc = async (docId) => {
    setSaveStatus('Saving and syncing Pinecone vectors...');
    await updatePolicyDoc(docId, docDraftContent);
    setEditingDocId(null);
    setSaveStatus('Document saved and vectors synced successfully!');
    setTimeout(() => setSaveStatus(''), 3000);
    loadAdminData();
  };

  const handleAddRAGDocument = async (e) => {
    e.preventDefault();
    if (!newDocTitle.trim() || !newDocContent.trim()) return;
    setIsIngesting(true);
    setSaveStatus('Chunking, embedding, and indexing into Pinecone...');

    try {
      const res = await addRAGDocument({
        title: newDocTitle.trim(),
        category: newDocCategory.trim() || 'General',
        content: newDocContent.trim(),
      });

      setSaveStatus(`Success: ${res.message} (${res.chunks_indexed} chunks created)`);
      setNewDocTitle('');
      setNewDocCategory('General');
      setNewDocContent('');
      setShowAddDocForm(false);
      setTimeout(() => setSaveStatus(''), 4000);
      loadAdminData();
    } catch (err) {
      setSaveStatus(`Failed: ${err.response?.data?.detail || 'Error adding document.'}`);
    } finally {
      setIsIngesting(false);
    }
  };

  const handleDeleteDoc = async (docId, title) => {
    if (!window.confirm(`Are you sure you want to delete "${title}"?`)) return;
    setSaveStatus(`Deleting "${title}"...`);
    try {
      await deletePolicyDoc(docId);
      setSaveStatus(`"${title}" deleted successfully!`);
      setTimeout(() => setSaveStatus(''), 3000);
      loadAdminData();
    } catch (err) {
      setSaveStatus(`Failed to delete document: ${err.response?.data?.detail || 'Error'}`);
    }
  };

  // --- Auth View ---
  if (!token || !userRole) {
    return (
      <div style={styles.authWrapper}>
        <div style={styles.authCard}>
          <h2 style={{ textAlign: 'center', margin: '0 0 4px 0' }}>COMSATS University Portal</h2>
          <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', marginBottom: '20px' }}>
            {isRegistering ? 'Student Registration Form' : 'Sign in as Student or Admin'}
          </p>

          {authMsg && <div style={styles.successBanner}>{authMsg}</div>}
          {authError && <div style={styles.errorBanner}>{authError}</div>}

          <form onSubmit={isRegistering ? handleRegister : handleLogin} style={{ display: 'grid', gap: '12px' }}>
            <div>
              <label style={styles.label}>{isRegistering ? 'Registration No (e.g. FA24-ELC-007)' : 'Username / Registration No'}</label>
              <input
                type="text"
                value={regNoInput}
                onChange={(e) => setRegNoInput(e.target.value)}
                style={styles.input}
                placeholder="FA24-ELC-007 or admin"
                required
              />
            </div>

            <div>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                style={styles.input}
                placeholder="Password123"
                required
              />
            </div>

            <button type="submit" style={styles.primaryBtn}>
              {isRegistering ? 'Submit Registration' : 'Login'}
            </button>
          </form>

          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button
              onClick={() => { setIsRegistering(!isRegistering); setAuthError(''); setAuthMsg(''); }}
              style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}
            >
              {isRegistering ? 'Already have an account? Sign In' : 'New student? Register here'}
            </button>
          </div>
        </div>
        {isLoggingIn && (
          <div className="login-loading" role="status" aria-label="Loading your workspace">
            <div className="login-loader" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <span>Loading your workspace...</span>
          </div>
        )}
      </div>
    );
  }

  // --- Dashboard View ---
  return (
    <div className={`app-shell theme-${theme}`} style={styles.appWrapper}>
      <aside className="app-sidebar" style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <div className="assistant-sphere" aria-hidden="true">
            <span />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', color: '#ffffff' }}>CUI Assistant</h3>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>
              {userRole === 'admin' ? 'Admin Portal' : 'Student Portal'}
            </span>
          </div>
        </div>

        <nav style={styles.sidebarNav}>
          {userRole === 'student' ? (
            <>
              <button
                onClick={() => setActiveTab('dashboard')}
                style={{ ...styles.navItem, backgroundColor: activeTab === 'dashboard' ? '#1e293b' : 'transparent' }}
              >
                📊 Overview & Tasks
              </button>
              <button
                onClick={() => setActiveTab('chat')}
                style={{ ...styles.navItem, backgroundColor: activeTab === 'chat' ? '#1e293b' : 'transparent' }}
              >
                🤖 AI Copilot Chat
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setActiveTab('approvals')}
                style={{ ...styles.navItem, backgroundColor: activeTab === 'approvals' ? '#1e293b' : 'transparent' }}
              >
                👥 Student Approvals
              </button>
              <button
                onClick={() => setActiveTab('documents')}
                style={{ ...styles.navItem, backgroundColor: activeTab === 'documents' ? '#1e293b' : 'transparent' }}
              >
                📄 Policy Documents (RAG)
              </button>
            </>
          )}
        </nav>

        <div style={styles.sidebarFooter}>
          <div className="theme-picker">
            <span className="theme-picker-label">Theme</span>
            <div className="theme-options" role="group" aria-label="Choose theme">
              {[
                ['default', 'Default', '#2563eb'],
                ['ocean', 'Ocean', '#1598b5'],
                ['forest', 'Forest', '#4d9a61'],
              ].map(([value, label, color]) => (
                <button
                  key={value}
                  type="button"
                  className={`theme-option ${theme === value ? 'selected' : ''}`}
                  onClick={() => handleThemeChange(value)}
                  aria-label={`${label} theme`}
                  aria-pressed={theme === value}
                  title={label}
                >
                  <span style={{ backgroundColor: color }} />
                </button>
              ))}
            </div>
          </div>
          <button onClick={handleLogout} style={styles.logoutBtn}>Sign Out</button>
        </div>
      </aside>

      <main className="app-content" style={styles.contentArea}>
        {/* STUDENT: DASHBOARD & TASKS */}
        {userRole === 'student' && activeTab === 'dashboard' && (
          <>
            {(shortAttendanceCount > 0 || upcomingDeadlineCount > 0) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {shortAttendanceCount > 0 && (
                  <div style={{ backgroundColor: '#fee2e2', color: '#b91c1c', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', fontWeight: '600' }}>
                    ⚠️ You have {shortAttendanceCount} course(s) with short attendance.
                  </div>
                )}
                {upcomingDeadlineCount > 0 && (
                  <span style={{ backgroundColor: '#fef3c7', color: '#92400e', padding: '7px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: '600' }}>
                    Upcoming deadline{upcomingDeadlineCount > 1 ? 's' : ''}: {upcomingDeadlineCount}
                  </span>
                )}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', height: '100%' }}>
            <div style={styles.card}>
              <h3 style={{ margin: '0 0 16px 0' }}>Academic Profile</h3>
              {studentData?.student && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                      <h2 style={{ margin: 0 }}>{studentData.student.name}</h2>
                      <span style={{ color: '#2563eb', fontWeight: 'bold' }}>{studentData.student.registration_no}</span>
                      <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>
                        {studentData.student.department} • Semester {studentData.student.semester}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#16a34a' }}>{studentData.student.cgpa}</div>
                      <span style={styles.badge}>{studentData.student.academic_standing}</span>
                    </div>
                  </div>

                  <h4 style={{ margin: '16px 0 8px 0', fontSize: '13px', color: '#64748b' }}>ENROLLED COURSES</h4>
                  <div style={{ display: 'grid', gap: '8px' }}>
                    {studentData.courses?.map((c) => {
                      const attendance = Math.max(0, Math.min(100, Number(c.attendance_pct) || 0));
                      const attendanceColor = attendance >= 80 ? '#16a34a' : '#dc2626';

                      return (
                        <div key={c.code} style={styles.itemBox}>
                          <div style={{ flex: 1 }}>
                            <strong>{c.code}</strong> - {c.title}
                            <div className="attendance-progress-track">
                              <div
                                className="attendance-progress-bar"
                                style={{ width: `${attendance}%`, backgroundColor: attendanceColor }}
                              />
                            </div>
                          </div>
                          <span
                            className="attendance-badge"
                            style={{ backgroundColor: attendanceColor }}
                          >
                            {attendance >= 80 ? `${attendance}% Att.` : `Short · ${attendance}%`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div style={styles.card}>
              <h3 style={{ margin: '0 0 16px 0' }}>My Tasks & Assignments</h3>
              <form onSubmit={handleAddTask} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                <input
                  type="text"
                  placeholder="Task title..."
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  style={{ ...styles.input, flex: 2 }}
                  required
                />
                <select value={taskCourse} onChange={(e) => setTaskCourse(e.target.value)} style={{ ...styles.input, flex: 1 }}>
                  {studentData?.courses?.map((c) => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
                <input
                  type="date"
                  value={taskDueDate}
                  onChange={(e) => setTaskDueDate(e.target.value)}
                  style={{ ...styles.input, flex: 1 }}
                />
                <button type="submit" style={styles.primaryBtn}>Add</button>
              </form>

              <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
                {['All', 'Pending', 'Completed'].map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setTaskFilter(filter)}
                    style={{
                      ...styles.taskFilter,
                      backgroundColor: taskFilter === filter ? '#2563eb' : '#e2e8f0',
                      color: taskFilter === filter ? '#fff' : '#334155',
                    }}
                  >
                    {filter}
                  </button>
                ))}
                <input
                  type="search"
                  placeholder="Search tasks..."
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  aria-label="Search tasks by title or course code"
                  style={{ ...styles.input, flex: 1, minWidth: '150px', marginLeft: 'auto' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '500px' }}>
                {studentData?.tasks?.length === 0 ? (
                  <p style={{ color: '#94a3b8', textAlign: 'center', margin: '20px 0' }}>No tasks added yet. Add one above or tell the AI assistant!</p>
                ) : filteredTasks.length === 0 ? (
                  <p style={{ color: '#94a3b8', textAlign: 'center', margin: '20px 0' }}>No matching tasks.</p>
                ) : (
                  filteredTasks.map((t) => (
                    <div key={t.id} style={styles.itemBox}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="checkbox" checked={t.status === 'completed'} onChange={() => handleToggleTask(t.id, t.status)} />
                        <div>
                          <span style={{ textDecoration: t.status === 'completed' ? 'line-through' : 'none' }}>{t.title}</span>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>
                            {t.course_code && <span style={styles.miniTag}>{t.course_code}</span>}
                            {t.due_date && <span>Due: {t.due_date}</span>}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => handleDeleteTask(t.id)} style={styles.deleteBtn}>Delete</button>
                    </div>
                  ))
                )}
              </div>
            </div>
            </div>
          </>
        )}

        {/* STUDENT: FULL PAGE CHAT */}
        {userRole === 'student' && activeTab === 'chat' && (
          <div style={{ ...styles.card, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 12px 0' }}>COMSATS AI Academic Copilot</h3>
            <div ref={chatLogRef} style={styles.chatLog}>
              {chatLog.map((m, i) => (
                <div
                  key={i}
                  className={m.sender === 'bot' ? 'ai-chat-bubble' : undefined}
                  style={{
                    ...styles.bubble,
                    alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                    backgroundColor: m.sender === 'user' ? '#2563eb' : '#f1f5f9',
                    color: m.sender === 'user' ? '#fff' : '#0f172a',
                  }}
                >
                  {m.sender === 'bot' ? (
                    <>
                      <button
                        type="button"
                        className="copy-message-button"
                        onClick={() => handleCopyMessage(m.text, i)}
                        aria-label="Copy AI response"
                        title={copiedMessageIndex === i ? 'Copied!' : 'Copy response'}
                      >
                        {copiedMessageIndex === i ? 'Copied!' : 'Copy'}
                      </button>
                      <div className="markdown-content">
                        <ReactMarkdown>{m.text}</ReactMarkdown>
                      </div>
                    </>
                  ) : m.text}
                </div>
              ))}
              {isTyping && (
                <div className="assistant-thinking" role="status" aria-label="Assistant is thinking">
                  <span className="thinking-orb" aria-hidden="true">
                    <span />
                  </span>
                  <span className="thinking-dots" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
              )}
            </div>
            {chatLog.length === 1 && chatLog[0].sender === 'bot' && (
              <div className="suggested-prompts" aria-label="Suggested prompts">
                {[
                  'What are the hostel options?',
                  'Check my attendance summary',
                  'What are the rules for fee installments?',
                  'Add a task: Prepare for Quiz next Monday',
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="suggested-prompt"
                    onClick={() => handleSendChat(null, prompt)}
                    disabled={isTyping}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={handleSendChat} style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
              <input
                type="text"
                placeholder="Ask about attendance rules, grading policies, or say 'Add Lab 5 task'..."
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                style={{ ...styles.input, flex: 1 }}
              />
              <button type="submit" disabled={isTyping} style={styles.primaryBtn}>Send</button>
            </form>
          </div>
        )}

        {/* ADMIN: STUDENT APPROVALS */}
        {userRole === 'admin' && activeTab === 'approvals' && (
          <div style={styles.card}>
            <h3 style={{ margin: '0 0 16px 0' }}>Student Registrations & Approvals</h3>
            <input
              type="search"
              placeholder="Search students..."
              value={studentSearch}
              onChange={(e) => setStudentSearch(e.target.value)}
              aria-label="Search student approvals"
              style={{ ...styles.input, marginBottom: '16px' }}
            />
            <table style={styles.table}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Registration No</th>
                  <th style={styles.th}>Department</th>
                  <th style={styles.th}>Status</th>
                  <th style={styles.th}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={styles.td}><strong>{s.name}</strong></td>
                    <td style={styles.td}>{s.registration_no}</td>
                    <td style={styles.td}>{s.department}</td>
                    <td style={styles.td}>
                      <span
                        style={{
                          padding: '3px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 'bold',
                          backgroundColor: s.status === 'approved' ? '#dcfce7' : s.status === 'rejected' ? '#fee2e2' : '#fef9c3',
                          color: s.status === 'approved' ? '#15803d' : s.status === 'rejected' ? '#b91c1c' : '#854d0e',
                        }}
                      >
                        {s.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => handleUpdateStudentStatus(s.id, 'approved')} style={styles.approveBtn}>Approve</button>
                        <button onClick={() => handleUpdateStudentStatus(s.id, 'rejected')} style={styles.rejectBtn}>Reject</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ADMIN: POLICY DOCUMENTS EDITOR & INGESTION */}
        {userRole === 'admin' && activeTab === 'documents' && (
          <div style={styles.card}>
            <input
              type="search"
              placeholder="Search policy documents..."
              value={documentSearch}
              onChange={(e) => setDocumentSearch(e.target.value)}
              aria-label="Search policy documents"
              style={{ ...styles.input, marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0 }}>University Policy Documents (RAG Knowledge Base)</h3>
                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
                  Add, edit, or remove policies. Content is automatically synced with Pinecone vector search.
                </p>
              </div>
              <button
                onClick={() => setShowAddDocForm(!showAddDocForm)}
                style={styles.primaryBtn}
              >
                {showAddDocForm ? 'Close Ingestion Form' : '+ Add New Document'}
              </button>
            </div>

            {saveStatus && (
              <div style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '6px', backgroundColor: '#f0fdf4', color: '#16a34a', fontWeight: 'bold', fontSize: '13px', border: '1px solid #bbf7d0' }}>
                {saveStatus}
              </div>
            )}

            {/* Ingestion Form */}
            {showAddDocForm && (
              <div style={{ ...styles.card, border: '1px solid #93c5fd', backgroundColor: '#eff6ff', marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#1e3a8a' }}>Ingest New Knowledge Base Document</h4>
                <form onSubmit={handleAddRAGDocument} style={{ display: 'grid', gap: '12px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px' }}>
                    <div>
                      <label style={styles.label}>Document Title</label>
                      <input
                        type="text"
                        placeholder="e.g. Lab Safety & Submission Policy"
                        value={newDocTitle}
                        onChange={(e) => setNewDocTitle(e.target.value)}
                        style={styles.input}
                        required
                      />
                    </div>
                    <div>
                      <label style={styles.label}>Category</label>
                      <input
                        type="text"
                        placeholder="e.g. Policies, Rules, Grading"
                        value={newDocCategory}
                        onChange={(e) => setNewDocCategory(e.target.value)}
                        style={styles.input}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={styles.label}>Content (Paste Text / Outline)</label>
                    <textarea
                      rows={6}
                      placeholder="Paste the full policy text here to automatically chunk, embed, and store into Pinecone..."
                      value={newDocContent}
                      onChange={(e) => setNewDocContent(e.target.value)}
                      style={{ ...styles.input, width: '100%', fontFamily: 'inherit' }}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => setShowAddDocForm(false)}
                      style={styles.secondaryBtn}
                      disabled={isIngesting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      style={styles.primaryBtn}
                      disabled={isIngesting}
                    >
                      {isIngesting ? 'Embedding & Indexing...' : 'Upload & Index to Pinecone'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div style={{ display: 'grid', gap: '16px' }}>
              {filteredDocuments.map((doc) => (
                <div key={doc.id} style={{ ...styles.card, border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div>
                      <span style={styles.miniTag}>{doc.category}</span>
                      <strong style={{ fontSize: '15px' }}>{doc.title}</strong>
                    </div>
                    {editingDocId === doc.id ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => handleSaveDoc(doc.id)} style={styles.approveBtn}>Save & Sync Vectors</button>
                        <button onClick={() => setEditingDocId(null)} style={styles.secondaryBtn}>Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => { setEditingDocId(doc.id); setDocDraftContent(doc.content); }} style={styles.secondaryBtn}>Edit Document</button>
                        <button onClick={() => handleDeleteDoc(doc.id, doc.title)} style={styles.rejectBtn}>Delete</button>
                      </div>
                    )}
                  </div>

                  {editingDocId === doc.id ? (
                    <textarea
                      value={docDraftContent}
                      onChange={(e) => setDocDraftContent(e.target.value)}
                      rows={5}
                      style={{ ...styles.input, width: '100%', fontFamily: 'inherit' }}
                    />
                  ) : (
                    <p style={{ margin: 0, color: '#334155', fontSize: '14px', lineHeight: '1.5' }}>{doc.content}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
      {isLoggingIn && (
        <div className="login-loading" role="status" aria-label="Loading your workspace">
          <div className="login-loader" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <span>Loading your workspace...</span>
        </div>
      )}
    </div>
  );
}

const styles = {
  authWrapper: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#0f172a', fontFamily: 'system-ui, sans-serif' },
  authCard: { backgroundColor: '#ffffff', padding: '32px', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' },
  appWrapper: { display: 'flex', height: '100vh', width: '100vw', backgroundColor: '#f1f5f9', fontFamily: 'system-ui, sans-serif' },
  sidebar: { width: '240px', backgroundColor: '#0f172a', color: '#fff', display: 'flex', flexDirection: 'column' },
  sidebarHeader: { padding: '20px', borderBottom: '1px solid #1e293b' },
  sidebarNav: { flex: 1, padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: '4px' },
  sidebarFooter: { padding: '16px', borderTop: '1px solid #1e293b' },
  navItem: { display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', color: '#e2e8f0', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: '500' },
  contentArea: { flex: 1, padding: '24px', overflowY: 'auto' },
  card: { backgroundColor: '#ffffff', borderRadius: '10px', padding: '20px', border: '1px solid #e2e8f0', boxSizing: 'border-box' },
  label: { display: 'block', fontSize: '12px', fontWeight: 'bold', color: '#475569', marginBottom: '4px' },
  input: { width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' },
  primaryBtn: { backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  secondaryBtn: { backgroundColor: '#e2e8f0', color: '#334155', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' },
  taskFilter: { border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' },
  logoutBtn: { width: '100%', backgroundColor: '#ef4444', color: '#fff', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
  approveBtn: { backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' },
  rejectBtn: { backgroundColor: '#dc2626', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' },
  deleteBtn: { backgroundColor: 'transparent', color: '#ef4444', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' },
  badge: { backgroundColor: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' },
  miniTag: { backgroundColor: '#e0e7ff', color: '#3730a3', padding: '2px 6px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', marginRight: '6px' },
  itemBox: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#f8fafc', padding: '10px 14px', borderRadius: '6px', border: '1px solid #e2e8f0' },
  chatLog: { flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' },
  bubble: { maxWidth: '80%', padding: '10px 14px', borderRadius: '8px', fontSize: '14px', lineHeight: '1.4', whiteSpace: 'pre-wrap' },
  table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' },
  th: { padding: '10px 14px', color: '#475569' },
  td: { padding: '12px 14px', color: '#1e293b' },
  errorBanner: { backgroundColor: '#fee2e2', color: '#dc2626', padding: '8px', borderRadius: '6px', fontSize: '12px', marginBottom: '10px' },
  successBanner: { backgroundColor: '#dcfce7', color: '#15803d', padding: '8px', borderRadius: '6px', fontSize: '12px', marginBottom: '10px' },
};