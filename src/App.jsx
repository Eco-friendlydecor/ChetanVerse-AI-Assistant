import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import NeuralCore from './components/NeuralCore.jsx';

const categories = ['Work', 'Study', 'Personal', 'Health', 'Other'];
const priorities = ['Low', 'Medium', 'High', 'Urgent'];
const taskStatuses = ['Todo', 'In progress', 'Blocked', 'Done'];
const projectStatuses = ['Planning', 'Active', 'Paused', 'Completed'];
const colors = ['#88d8ad', '#8eb8ff', '#c8a7ff', '#ffb980', '#ff91a8'];

function localDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateLabel(value) {
  if (!value) return 'No due date';
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date);
}

function prettyDate(value) {
  return new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(value);
}

async function request(url, options) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options?.body ? { 'Content-Type': 'application/json' } : {}), ...options?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status}).`);
  }
  if (response.status === 204) return null;
  return response.json();
}

function Icon({ name, size = 18 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  const paths = {
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v12h14V9M9 21v-7h6v7"/></>,
    tasks: <><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12 2.3 2.3L16 9"/></>,
    projects: <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 9h18M8 4v5"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    calendar: <><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M4 10h16"/></>,
    more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
    close: <><path d="m6 6 12 12M18 6 6 18"/></>,
    spark: <><path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-2.1-5.8L4 11l5.9-2.2L12 3Z"/><path d="m19 14 1.1 2.9L23 18l-2.9 1.1L19 22l-1.1-2.9L15 18l2.9-1.1L19 14Z"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function TaskRow({ task, project, onToggle, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const overdue = task.dueDate && task.dueDate < localDate() && task.status !== 'Done';
  return (
    <article className={`task-row ${task.status === 'Done' ? 'is-done' : ''}`} onKeyDown={(event) => { if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); event.currentTarget.querySelector('.more-button')?.focus(); } }}>
      <button className={`task-check ${task.status === 'Done' ? 'checked' : ''}`} aria-label={task.status === 'Done' ? 'Mark as todo' : 'Mark as done'} onClick={() => onToggle(task)}>
        {task.status === 'Done' && <Icon name="check" size={14} />}
      </button>
      <div className="task-main">
        <button className="task-title" onClick={() => onEdit(task)}>{task.title}</button>
        <div className="task-meta">
          <span className={`category-dot category-${task.category.toLowerCase()}`} />
          <span>{task.category}</span>
          <span className="meta-separator">·</span>
          <span>{project?.name || 'Personal'}</span>
        </div>
      </div>
      <span className={`priority-pill priority-${task.priority.toLowerCase()}`}><span />{task.priority}</span>
      <span className={`task-due ${overdue ? 'overdue' : ''}`}><Icon name="calendar" size={14} />{dateLabel(task.dueDate)}</span>
      <div className="task-actions">
        <button className="icon-button more-button" aria-label="Task options" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><Icon name="more" /></button>
        {menuOpen && <div className="action-menu" role="menu"><button role="menuitem" onClick={() => { setMenuOpen(false); onEdit(task); }}>Edit task</button><button role="menuitem" className="danger-text" onClick={() => { setMenuOpen(false); onDelete(task); }}>Delete task</button></div>}
      </div>
    </article>
  );
}

function EmptyState({ title, detail, action, onAction }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name="tasks" size={21} /></div><strong>{title}</strong><p>{detail}</p>{action && <button className="button button-secondary button-small" onClick={onAction}><Icon name="plus" size={15} />{action}</button>}</div>;
}

function useDialogControls(onClose, dialogRef) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const initialFocus = dialogRef.current?.querySelector('input, textarea, select, button');
    initialFocus?.focus();
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
}

function CountUp({ value }) {
  const [display, setDisplay] = useState(value);
  useEffect(() => {
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!Number.isFinite(Number(value))) { setDisplay(value); return undefined; }
    const target = Number(value);
    if (motion?.matches) { setDisplay(value); return undefined; }
    const start = performance.now();
    const duration = 650;
    let frame;
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      setDisplay(Math.round(target * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    const onMotionChange = (event) => {
      if (!event.matches) return;
      if (frame) cancelAnimationFrame(frame);
      setDisplay(value);
    };
    motion?.addEventListener?.('change', onMotionChange);
    return () => { if (frame) cancelAnimationFrame(frame); motion?.removeEventListener?.('change', onMotionChange); };
  }, [value]);
  return <>{display}</>;
}

function setTilt(event) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce), (hover: none), (pointer: coarse)').matches) return;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width - 0.5;
  const y = (event.clientY - rect.top) / rect.height - 0.5;
  event.currentTarget.style.setProperty('--mx', `${((x + .5) * 100).toFixed(1)}%`);
  event.currentTarget.style.setProperty('--my', `${((y + .5) * 100).toFixed(1)}%`);
  event.currentTarget.style.setProperty('--tilt-x', `${(-y * 5).toFixed(2)}deg`);
  event.currentTarget.style.setProperty('--tilt-y', `${(x * 6).toFixed(2)}deg`);
}

function resetTilt(event) {
  event.currentTarget.style.setProperty('--tilt-x', '0deg');
  event.currentTarget.style.setProperty('--tilt-y', '0deg');
}

function App() {
  const [page, setPageState] = useState('Overview');
  const setPage = useCallback((nextPage) => {
    const update = () => setPageState(nextPage);
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduceMotion && document.startViewTransition) {
      try { document.startViewTransition(update); } catch { update(); }
    } else update();
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dashboard, setDashboard] = useState({ counts: { open: 0, completed: 0, dueToday: 0, projects: 0 }, tasks: [], projects: [] });
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All tasks');
  const [projectFilter, setProjectFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [dash, allTasks, allProjects, daily] = await Promise.all([
        request('/api/dashboard'), request('/api/tasks'), request('/api/projects'), request('/api/summary/today'),
      ]);
      setDashboard(dash); setTasks(allTasks); setProjects(allProjects); setSummary(daily);
    } catch (err) {
      setError(err.message || 'Could not connect to the local Chetanverse API.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(timeout);
  }, [toast]);

  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const filteredTasks = useMemo(() => tasks.filter((task) => {
    const matchesSearch = !search || `${task.title} ${task.description}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'All tasks' || (filter === 'Due today' ? task.dueDate === localDate() && task.status !== 'Done' : task.status === filter);
    return matchesSearch && matchesFilter && (!projectFilter || task.projectId === projectFilter);
  }), [tasks, search, filter, projectFilter]);

  async function saveTask(payload, id) {
    await request(id ? `/api/tasks/${id}` : '/api/tasks', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    setDialog(null); setToast(id ? 'Task updated' : 'Task added'); await refresh();
  }

  async function saveProject(payload, id) {
    await request(id ? `/api/projects/${id}` : '/api/projects', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
    setDialog(null); setToast(id ? 'Project updated' : 'Project created'); await refresh();
  }

  async function toggleTask(task) {
    try {
      await request(`/api/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ status: task.status === 'Done' ? 'Todo' : 'Done' }) });
      setToast(task.status === 'Done' ? 'Task moved to todo' : 'Task completed');
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not update the task.');
    }
  }

  async function removeTask(task) {
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
    try {
      await request(`/api/tasks/${task.id}`, { method: 'DELETE' });
      setToast('Task deleted');
      await refresh();
    } catch (err) {
      setError(err.message || 'Could not delete the task.');
    }
  }

  async function removeProject(project) {
    if (!window.confirm(`Delete “${project.name}”? Its tasks will be kept as unassigned.`)) return false;
    await request(`/api/projects/${project.id}`, { method: 'DELETE' });
    if (projectFilter === project.id) setProjectFilter('');
    setDialog(null);
    setToast('Project deleted');
    await refresh();
    return true;
  }

  const openTasks = tasks.filter((task) => task.status !== 'Done');
  const today = new Date();
  const greeting = 'Good morning';
  const greetingName = 'Chetan';
  const completedRatio = tasks.length ? Math.round((tasks.filter((task) => task.status === 'Done').length / tasks.length) * 100) : null;
  const statusCounts = taskStatuses.map((status) => ({ status, count: tasks.filter((task) => task.status === status).length }));

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <aside className="sidebar">
        <div className="brand-row"><a className="brand" href="#overview" onClick={() => setPage('Overview')}><span className="brand-mark"><span /><span /><span /><span /></span><span className="brand-name">chetanverse<span className="brand-period">.</span></span></a><button className="icon-button sidebar-toggle" aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}><Icon name="chevron" size={16} /></button></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {['Overview', 'Tasks', 'Projects'].map((item) => <button key={item} aria-label={item} title={sidebarCollapsed ? item : undefined} className={`nav-item ${page === item ? 'active' : ''}`} onClick={() => setPage(item)}><Icon name={item === 'Overview' ? 'home' : item === 'Tasks' ? 'tasks' : 'projects'} /><span>{item}</span>{item === 'Tasks' && openTasks.length > 0 && <span className="nav-count">{openTasks.length}</span>}</button>)}
        </nav>
        <div className="sidebar-rule" />
        <div className="sidebar-section-heading"><span>YOUR PROJECTS</span><button aria-label="Create project" className="icon-button tiny-add" onClick={() => setDialog({ type: 'project' })}><Icon name="plus" size={16} /></button></div>
        <div className="sidebar-projects">
          {projects.slice(0, 5).map((project) => <button key={project.id} className="sidebar-project" title={project.name} aria-label={`Project ${project.name}`} onClick={() => { setPage('Projects'); }}><span className="project-color-dot" style={{ '--project-color': project.color }} />{project.name}</button>)}
          {projects.length === 0 && <p className="sidebar-empty">Your projects will appear here.</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="local-status"><span className="status-light" /><div><strong>Private workspace</strong><small>Saved on this device</small></div></div>
          <div className="profile"><div className="avatar">C</div><div className="profile-name"><strong>Chetan Sahu</strong><small>Personal workspace</small></div><span className="profile-menu">···</span></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><Icon name="chevron" size={14} /><strong>{page}</strong></div>
          <div className="topbar-actions"><span className="today-label"><Icon name="calendar" size={15} />{prettyDate(today)}</span><button className="button button-primary top-add" onClick={() => setDialog({ type: 'task' })}><Icon name="plus" size={16} />New task</button><button className="button button-primary mobile-add" aria-label="New task" onClick={() => setDialog({ type: 'task' })}><Icon name="plus" size={17} /></button></div>
        </header>

        {error && <div className="error-banner"><span>{error}</span><button className="button button-secondary button-small" onClick={refresh}>Retry</button></div>}

        {page === 'Overview' && <div className="page-wrap page-transition" key={page}>
          <section className="hero-panel glass">
            <div className="hero-copy"><div className="eyebrow"><span className="eyebrow-line" />YOUR PERSONAL WORKSPACE</div><h1>{greeting}, {greetingName}<span className="wave">✳</span></h1><p className="hero-subtitle">Your productivity, powered by intelligence.</p><button className="button button-primary" onClick={() => setDialog({ type: 'task' })}><Icon name="plus" size={16} />Add a task</button></div>
            <NeuralCore projects={projects} completionRatio={completedRatio} openCount={dashboard.counts.open} overdueCount={summary?.totals.overdue || 0} dueToday={dashboard.counts.dueToday} />
          </section>

          <section className="stat-grid" aria-label="Workspace summary">
            <div className="stat-card glass" onPointerMove={setTilt} onPointerLeave={resetTilt}><div className="stat-top"><span className="stat-label">Open tasks</span><span className="stat-icon stat-icon-green"><Icon name="tasks" size={17} /></span></div><strong className="stat-number"><CountUp value={dashboard.counts.open}/></strong><span className="stat-foot">Across all projects</span></div>
            <div className="stat-card" onPointerMove={setTilt} onPointerLeave={resetTilt}><div className="stat-top"><span className="stat-label">Due today</span><span className="stat-icon stat-icon-peach"><Icon name="calendar" size={17} /></span></div><strong className="stat-number"><CountUp value={dashboard.counts.dueToday}/></strong><span className="stat-foot">Keep your focus on what matters</span></div>
            <div className="stat-card" onPointerMove={setTilt} onPointerLeave={resetTilt}><div className="stat-top"><span className="stat-label">Completed</span><span className="stat-icon stat-icon-purple"><Icon name="check" size={17} /></span></div><strong className="stat-number"><CountUp value={dashboard.counts.completed}/></strong><span className="stat-foot">All-time finished tasks</span></div>
            <div className="stat-card" onPointerMove={setTilt} onPointerLeave={resetTilt}><div className="stat-top"><span className="stat-label">Active projects</span><span className="stat-icon stat-icon-blue"><Icon name="projects" size={17} /></span></div><strong className="stat-number"><CountUp value={projects.filter((project) => project.status === 'Active').length}/></strong><span className="stat-foot">{projects.length} total projects</span></div>
          </section>

          <section className="analytics-grid" aria-label="Productivity analytics">
            <div className="panel glass analytics-panel" onPointerMove={setTilt} onPointerLeave={resetTilt}><div className="panel-heading"><div><div className="panel-overline">LIVE WORKLOAD</div><h2>Task distribution</h2></div><span className="live-badge"><i/>LIVE DATA</span></div><div className="distribution-bars" role="group" aria-label={`Current task distribution: ${statusCounts.map(({status,count}) => `${status} ${count}`).join(', ')}.`}>{statusCounts.map(({status,count}) => <div className={`distribution-row status-${status.toLowerCase().replace(' ','-')}`} key={status} tabIndex="0" title={`${status}: ${count} saved tasks`}><span>{status}</span><div className="distribution-track"><span style={{width:`${tasks.length ? Math.max((count/tasks.length)*100, count ? 3 : 0) : 0}%`}}/></div><strong>{count}</strong></div>)}</div><p className="analytics-note">Calculated from your {tasks.length} saved task{tasks.length === 1 ? '' : 's'}.</p></div>
            <div className="panel glass score-panel" onPointerMove={setTilt} onPointerLeave={resetTilt}><div><div className="panel-overline">MOMENTUM</div><h2>Productivity score</h2></div><div className="score-content"><div className="score-ring"><svg viewBox="0 0 100 100" role="img" aria-label={`Completion score: ${completedRatio === null ? 'no tasks yet' : `${completedRatio}% of saved tasks complete`}`}><defs><linearGradient id="score-gradient" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#5be4f7"/><stop offset="100%" stopColor="#a88bff"/></linearGradient></defs><circle className="score-track" cx="50" cy="50" r="41"/><circle className="score-progress" cx="50" cy="50" r="41" strokeDasharray="257.61" strokeDashoffset={257.61 * (1 - (completedRatio ?? 0) / 100)}/><circle className="score-dot" cx={50 + 41 * Math.cos(((completedRatio ?? 0) * 3.6 - 90) * Math.PI / 180)} cy={50 + 41 * Math.sin(((completedRatio ?? 0) * 3.6 - 90) * Math.PI / 180)} r="2.5"/></svg><div className="score-center"><strong>{completedRatio === null ? '?' : <><CountUp value={completedRatio}/><small>%</small></>}</strong><span>{completedRatio === null ? 'No tasks yet' : 'completed'}</span></div></div><div className="score-copy"><strong>{completedRatio === null ? 'Ready when you are' : completedRatio >= 70 ? 'You’re building great momentum.' : 'Every completed step counts.'}</strong><p>{summary?.totals.completedToday || 0} completed today · {summary?.totals.overdue || 0} overdue</p></div></div><p className="analytics-note">Completion rate across saved tasks · updates as tasks change.</p></div>
          </section>

          <div className="overview-columns">
            <section className="panel glass focus-panel" onPointerMove={setTilt} onPointerLeave={resetTilt}>
              <div className="panel-heading"><div><div className="panel-overline">YOUR DAY, AT A GLANCE</div><h2>Today’s focus</h2></div><button className="text-link" onClick={() => { setPage('Tasks'); setFilter('Due today'); }}>View all<Icon name="arrow" size={15} /></button></div>
              <div className="focus-summary"><div className="focus-ring"><div><strong>{dashboard.counts.dueToday}</strong><span>due today</span></div></div><div className="focus-text"><strong>{dashboard.counts.dueToday ? 'You have a few things to focus on.' : 'No deadlines weighing you down.'}</strong><p>{summary?.totals.completedToday ? `${summary.totals.completedToday} task${summary.totals.completedToday === 1 ? '' : 's'} completed today. ` : ''}{summary?.totals.overdue ? `${summary.totals.overdue} overdue task${summary.totals.overdue === 1 ? '' : 's'} need attention.` : 'Make space for the work that matters.'}</p></div></div>
              <div className="focus-task-list">{tasks.filter((task) => task.dueDate === localDate() && task.status !== 'Done').slice(0, 3).map((task) => <TaskRow key={task.id} task={task} project={projectById.get(task.projectId)} onToggle={toggleTask} onEdit={(item) => setDialog({ type: 'task', item })} onDelete={removeTask} />)}{dashboard.counts.dueToday === 0 && <div className="quiet-empty">No tasks due today. Enjoy the breathing room.</div>}</div>
            </section>

            <section className="panel glass project-panel" onPointerMove={setTilt} onPointerLeave={resetTilt}>
              <div className="panel-heading"><div><div className="panel-overline">BIG PICTURE</div><h2>Projects</h2></div><button className="text-link" onClick={() => setPage('Projects')}>All projects<Icon name="arrow" size={15} /></button></div>
              <div className="project-preview-list">{projects.filter((project) => project.status !== 'Completed').slice(0, 4).map((project) => <div className="project-preview" key={project.id}><div className="project-preview-head"><span className="project-color-dot large" style={{ '--project-color': project.color }} /><div className="project-preview-name"><strong>{project.name}</strong><span>{project.completedCount} of {project.taskCount} tasks complete</span></div><span className="progress-number">{project.progress}%</span></div><div className="progress-track"><span style={{ width: `${project.progress}%`, '--project-color': project.color }} /></div></div>)}{projects.filter((project) => project.status !== 'Completed').length === 0 && <EmptyState title="Start with a project" detail="Group related tasks and follow progress in one place." action="New project" onAction={() => setDialog({ type: 'project' })} />}</div>
              <button className="project-create-link" onClick={() => setDialog({ type: 'project' })}><span className="create-circle"><Icon name="plus" size={15} /></span>Create a new project</button>
            </section>
          </div>

          <section className="panel glass tasks-panel" onPointerMove={setTilt} onPointerLeave={resetTilt}>
            <div className="panel-heading"><div><div className="panel-overline">STAY IN MOTION</div><h2>Up next</h2></div><button className="text-link" onClick={() => setPage('Tasks')}>All tasks<Icon name="arrow" size={15} /></button></div>
            <div className="task-list">{dashboard.tasks.filter((task) => task.status !== 'Done').slice(0, 5).map((task) => <TaskRow key={task.id} task={task} project={projectById.get(task.projectId)} onToggle={toggleTask} onEdit={(item) => setDialog({ type: 'task', item })} onDelete={removeTask} />)}{!loading && dashboard.counts.open === 0 && <EmptyState title="Your list is clear" detail="Add a task here or ask your Codex agent in Switch to capture one." action="Create a task" onAction={() => setDialog({ type: 'task' })} />}</div>
          </section>
          <footer className="page-footer"><span>Made for thoughtful work.</span><span><span className="footer-status" />Your work is saved locally</span></footer>
        </div>}

        {page === 'Tasks' && <div className="page-wrap list-page page-transition" key={page}>
          <section className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-line" />YOUR WORK, IN ONE PLACE</div><h1>Tasks<span className="title-count">{tasks.length}</span></h1><p className="welcome-copy">Keep the next step clear and the bigger picture close.</p></div><button className="button button-primary" onClick={() => setDialog({ type: 'task' })}><Icon name="plus" size={16} />New task</button></section>
          <div className="list-toolbar"><div className="filter-tabs">{['All tasks', 'Todo', 'In progress', 'Blocked', 'Done', 'Due today'].map((item) => <button key={item} className={filter === item ? 'selected' : ''} onClick={() => setFilter(item)}>{item}{item === 'All tasks' && <span>{tasks.length}</span>}</button>)}</div><div className="list-controls"><select className="project-filter" aria-label="Filter by project" value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}><option value="">All projects</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select><label className="search-box"><Icon name="search" size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks" /></label></div></div>
          <section className="panel glass full-list-panel" onPointerMove={setTilt} onPointerLeave={resetTilt}><div className="list-heading-row"><span>TASK</span><span>PRIORITY</span><span>DUE DATE</span><span /></div><div className="task-list">{filteredTasks.map((task) => <TaskRow key={task.id} task={task} project={projectById.get(task.projectId)} onToggle={toggleTask} onEdit={(item) => setDialog({ type: 'task', item })} onDelete={removeTask} />)}{filteredTasks.length === 0 && <EmptyState title={tasks.length ? 'No matching tasks' : 'Nothing on your list yet'} detail={tasks.length ? 'Try changing your filters or search.' : 'Create a task or add one from your Codex agent in Switch.'} action={tasks.length ? undefined : 'Create a task'} onAction={() => setDialog({ type: 'task' })} />}</div></section>
          <footer className="page-footer"><span>{filteredTasks.length} task{filteredTasks.length === 1 ? '' : 's'} shown</span><span><span className="footer-status" />Saved locally</span></footer>
        </div>}

        {page === 'Projects' && <div className="page-wrap list-page">
          <section className="page-title-row"><div><div className="eyebrow"><span className="eyebrow-line" />THE LONGER VIEW</div><h1>Projects<span className="title-count">{projects.length}</span></h1><p className="welcome-copy">See what’s moving and what still needs a little care.</p></div><button className="button button-primary" onClick={() => setDialog({ type: 'project' })}><Icon name="plus" size={16} />New project</button></section>
          <div className="projects-grid">{projects.map((project) => <article className="project-card glass" key={project.id} onPointerMove={setTilt} onPointerLeave={resetTilt}><div className="project-card-top"><span className="project-color-dot large" style={{ '--project-color': project.color }} /><div className="project-card-actions"><span className={`status-badge status-${project.status.toLowerCase()}`}>{project.status}</span><button className="icon-button" aria-label={`Edit ${project.name}`} onClick={() => setDialog({ type: 'project', item: project })}><Icon name="more" /></button></div></div><h2>{project.name}</h2><p className="project-description">{project.description || 'A space to make steady progress.'}</p><div className="project-progress-copy"><span>Overall progress</span><strong>{project.progress}%</strong></div><div className="progress-track project-progress"><span style={{ width: `${project.progress}%`, '--project-color': project.color }} /></div><div className="project-card-footer"><span>{project.completedCount} of {project.taskCount} tasks completed</span><button className="text-link" onClick={() => { setPage('Tasks'); setSearch(''); setFilter('All tasks'); setProjectFilter(project.id); }}>Tasks<Icon name="arrow" size={14} /></button></div></article>)}{projects.length === 0 && <div className="panel glass project-empty-panel"><EmptyState title="Every big thing starts somewhere" detail="Create a project to group tasks and see progress build over time." action="Create your first project" onAction={() => setDialog({ type: 'project' })} /></div>}</div>
          <footer className="page-footer"><span>Progress is based on completed tasks.</span><span><span className="footer-status" />Saved locally</span></footer>
        </div>}
      </main>

      {dialog?.type === 'task' && <TaskDialog item={dialog.item} projects={projects} onClose={() => setDialog(null)} onSave={saveTask} />}
      {dialog?.type === 'project' && <ProjectDialog item={dialog.item} onClose={() => setDialog(null)} onSave={saveProject} onDelete={removeProject} />}
      {toast && <div className="toast" role="status" aria-live="polite"><span className="toast-check"><Icon name="check" size={14} /></span>{toast}</div>}
      {loading && !error && <div className="loading-indicator" aria-live="polite">Updating your workspace…</div>}
    </div>
  );
}

function TaskDialog({ item, projects, onClose, onSave }) {
  const dialogRef = useRef(null);
  useDialogControls(onClose, dialogRef);
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDescription] = useState(item?.description || '');
  const [category, setCategory] = useState(item?.category || 'Work');
  const [priority, setPriority] = useState(item?.priority || 'Medium');
  const [status, setStatus] = useState(item?.status || 'Todo');
  const [dueDate, setDueDate] = useState(item?.dueDate || '');
  const [projectId, setProjectId] = useState(item?.projectId || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('');
    try { await onSave({ title, description, category, priority, status, dueDate: dueDate || null, projectId: projectId || null }, item?.id); }
    catch (err) { setError(err.message); setSaving(false); }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form ref={dialogRef} className="dialog glass" role="dialog" aria-modal="true" onSubmit={submit} aria-labelledby="task-dialog-title"><div className="dialog-head"><div><div className="panel-overline">{item ? 'REFINE THE DETAILS' : 'A SMALL STEP FORWARD'}</div><h2 id="task-dialog-title">{item ? 'Edit task' : 'Create a task'}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div><label className="field-label" htmlFor="task-title">Task name</label><input id="task-title" required maxLength="180" className="form-input" placeholder="What needs to get done?" value={title} onChange={(event) => setTitle(event.target.value)} /><label className="field-label" htmlFor="task-description">Notes <span>Optional</span></label><textarea id="task-description" maxLength="2000" className="form-input form-textarea" placeholder="Add a little context..." value={description} onChange={(event) => setDescription(event.target.value)} /><div className="form-grid"><div><label className="field-label" htmlFor="task-category">Category</label><select id="task-category" className="form-input" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((value) => <option key={value}>{value}</option>)}</select></div><div><label className="field-label" htmlFor="task-priority">Priority</label><select id="task-priority" className="form-input" value={priority} onChange={(event) => setPriority(event.target.value)}>{priorities.map((value) => <option key={value}>{value}</option>)}</select></div><div><label className="field-label" htmlFor="task-status">Status</label><select id="task-status" className="form-input" value={status} onChange={(event) => setStatus(event.target.value)}>{taskStatuses.map((value) => <option key={value}>{value}</option>)}</select></div><div><label className="field-label" htmlFor="task-due">Due date</label><input id="task-due" type="date" className="form-input" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div></div><label className="field-label" htmlFor="task-project">Project <span>Optional</span></label><select id="task-project" className="form-input" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">Personal / unassigned</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}</select>{error && <div className="form-error">{error}</div>}<div className="dialog-actions"><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : item ? 'Save changes' : 'Create task'}</button></div></form></div>;
}

function ProjectDialog({ item, onClose, onSave, onDelete }) {
  const dialogRef = useRef(null);
  useDialogControls(onClose, dialogRef);
  const [name, setName] = useState(item?.name || '');
  const [description, setDescription] = useState(item?.description || '');
  const [status, setStatus] = useState(item?.status || 'Active');
  const [color, setColor] = useState(item?.color || colors[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setSaving(true); setError('');
    try { await onSave({ name, description, status, color }, item?.id); }
    catch (err) { setError(err.message); setSaving(false); }
  }
  async function remove() {
    setSaving(true); setError('');
    try { if (!await onDelete(item)) setSaving(false); }
    catch (err) { setError(err.message || 'Could not delete the project.'); setSaving(false); }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form ref={dialogRef} className="dialog glass compact-dialog" role="dialog" aria-modal="true" onSubmit={submit} aria-labelledby="project-dialog-title"><div className="dialog-head"><div><div className="panel-overline">MAKE SPACE FOR THE BIGGER PICTURE</div><h2 id="project-dialog-title">{item ? 'Edit project' : 'New project'}</h2></div><button type="button" className="icon-button" aria-label="Close" onClick={onClose}><Icon name="close" /></button></div><label className="field-label" htmlFor="project-name">Project name</label><input id="project-name" autoFocus required maxLength="100" className="form-input" placeholder="e.g. Launch my portfolio" value={name} onChange={(event) => setName(event.target.value)} /><label className="field-label" htmlFor="project-description">Description <span>Optional</span></label><textarea id="project-description" maxLength="1000" className="form-input form-textarea" placeholder="What does success look like?" value={description} onChange={(event) => setDescription(event.target.value)} /><div className="form-grid"><div><label className="field-label" htmlFor="project-status">Status</label><select id="project-status" className="form-input" value={status} onChange={(event) => setStatus(event.target.value)}>{projectStatuses.map((value) => <option key={value}>{value}</option>)}</select></div><div><label className="field-label">Accent color</label><div className="color-options">{colors.map((value) => <button type="button" key={value} className={`color-option ${value === color ? 'selected' : ''}`} style={{ '--project-color': value }} aria-label={`Select color ${value}`} onClick={() => setColor(value)} />)}</div></div></div>{error && <div className="form-error" role="alert">{error}</div>}<div className="dialog-actions">{item && <button className="button button-danger" type="button" onClick={remove} disabled={saving}>{saving ? 'Deleting…' : 'Delete project'}</button>}<button className="button button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Saving…' : item ? 'Save changes' : 'Create project'}</button></div></form></div>;
}

export default App;
