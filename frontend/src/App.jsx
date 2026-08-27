import React, { useState, useEffect } from 'react';
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

  // Student Dashboard State
  const [studentData, setStudentData] = useState(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCourse, setTaskCourse] = useState('');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [chatLog, setChatLog] = useState([
    { sender: 'bot', text: 'Welcome to COMSATS Assistant! Ask me anything about university rules, attendance, or tasks.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Admin Dashboard State
  const [adminStudents, setAdminStudents] = useState([]);
  const [adminDocs, setAdminDocs] = useState([]);
  const [editingDocId, setEditingDocId] = useState(null);
  const [docDraftContent, setDocDraftContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

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
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthMsg('');
    try {
      const res = await loginUser(regNoInput.trim(), passwordInput.trim());
      localStorage.setItem('cui_token', res.access_token);
      localStorage.setItem('cui_role', res.role);
      setToken(res.access_token);
      setUserRole(res.role);
      setActiveTab(res.role === 'admin' ? 'approvals' : 'dashboard');
    } catch (err) {
      setAuthError(err.response?.data?.detail || 'Login failed.');
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

  const handleSendChat = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || isTyping) return;
    const msg = chatInput;
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
      </div>
    );
  }

  // --- Dashboard View ---
  return (
    <div style={styles.appWrapper}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <h3 style={{ margin: 0, fontSize: '16px', color: '#ffffff' }}>CUI Assistant</h3>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            {userRole === 'admin' ? 'Admin Portal' : 'Student Portal'}
          </span>
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
          <button onClick={handleLogout} style={styles.logoutBtn}>Sign Out</button>
        </div>
      </aside>

      <main style={styles.contentArea}>
        {/* STUDENT: DASHBOARD & TASKS */}
        {userRole === 'student' && activeTab === 'dashboard' && (
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
                    {studentData.courses?.map((c) => (
                      <div key={c.code} style={styles.itemBox}>
                        <div>
                          <strong>{c.code}</strong> - {c.title}
                        </div>
                        <span style={{ fontWeight: 'bold' }}>{c.attendance_pct}% Att.</span>
                      </div>
                    ))}
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '500px' }}>
                {studentData?.tasks?.length === 0 ? (
                  <p style={{ color: '#94a3b8', textAlign: 'center', margin: '20px 0' }}>No tasks added yet. Add one above or tell the AI assistant!</p>
                ) : (
                  studentData?.tasks?.map((t) => (
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
        )}

        {/* STUDENT: FULL PAGE CHAT */}
        {userRole === 'student' && activeTab === 'chat' && (
          <div style={{ ...styles.card, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ margin: '0 0 12px 0' }}>COMSATS AI Academic Copilot</h3>
            <div style={styles.chatLog}>
              {chatLog.map((m, i) => (
                <div
                  key={i}
                  style={{
                    ...styles.bubble,
                    alignSelf: m.sender === 'user' ? 'flex-end' : 'flex-start',
                    backgroundColor: m.sender === 'user' ? '#2563eb' : '#f1f5f9',
                    color: m.sender === 'user' ? '#fff' : '#0f172a',
                  }}
                >
                  {m.text}
                </div>
              ))}
              {isTyping && <div style={{ fontSize: '12px', color: '#64748b' }}>Assistant is typing...</div>}
            </div>
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
                {adminStudents.map((s) => (
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

        {/* ADMIN: POLICY DOCUMENTS EDITOR */}
        {userRole === 'admin' && activeTab === 'documents' && (
          <div style={styles.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0 }}>University Policy Documents (RAG Knowledge Base)</h3>
                <p style={{ margin: '4px 0 0 0', color: '#64748b', fontSize: '13px' }}>
                  Edit policies here. The AI Assistant will instantly sync its Pinecone vectors without touching code.
                </p>
              </div>
              {saveStatus && <span style={{ fontSize: '12px', color: '#16a34a', fontWeight: 'bold' }}>{saveStatus}</span>}
            </div>

            <div style={{ display: 'grid', gap: '16px' }}>
              {adminDocs.map((doc) => (
                <div key={doc.id} style={{ ...styles.card, border: '1px solid #cbd5e1', backgroundColor: '#f8fafc' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
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
                      <button onClick={() => { setEditingDocId(doc.id); setDocDraftContent(doc.content); }} style={styles.secondaryBtn}>Edit Document</button>
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