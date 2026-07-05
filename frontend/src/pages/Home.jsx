import { useState, useEffect, useContext, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import './Home.css';

function Home() {
  const { claims } = useContext(AuthContext);
  const [org, setOrg] = useState(null);
  const [usage, setUsage] = useState(null);
  const [users, setUsers] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshingUsage, setRefreshingUsage] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadDashboard() {
      setLoading(true);
      setError('');
      try {
        const [orgRes, usageRes, usersRes, auditRes] = await Promise.all([
          axiosClient.get('/organizations/me'),
          axiosClient.get('/usage'),
          axiosClient.get('/users'),
          axiosClient.get('/audit-logs'),
        ]);
        setOrg(orgRes.data);
        setUsage(usageRes.data);
        setUsers(usersRes.data);
        setAuditLogs(auditRes.data.content);
      } catch (err) {
        setError('Failed to load dashboard data.');
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const refreshUsage = useCallback(async () => {
    setRefreshingUsage(true);
    try {
      const usageRes = await axiosClient.get('/usage');
      setUsage(usageRes.data);
    } catch (err) {
      // Silently ignore; the existing usage numbers just stay stale on failure
    } finally {
      setRefreshingUsage(false);
    }
  }, []);

  // Build userId -> email lookup for displaying audit log actors
  const userEmailById = {};
  users.forEach((u) => {
    userEmailById[u.id] = u.email;
  });

  const activeMembers = users.filter((u) => u.status === 'ACTIVE').length;
  const distinctRoles = new Set();
  users.forEach((u) => u.roles.forEach((r) => distinctRoles.add(r)));

  const usagePercent = usage
    ? Math.round((usage.tokensRemaining / usage.limitPerMinute) * 100)
    : 0;

  const refillPerSecond = usage ? (usage.limitPerMinute / 60).toFixed(2) : '—';

  const orgFirstName = claims?.sub ? claims.sub.split('@')[0] : 'there';
  const currentRole = claims?.roles?.[0] || '—';

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTimestamp = (isoString) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return formatDate(isoString);
  };

  const formatActionLabel = (log) => {
    const actorEmail = userEmailById[log.actorUserId] || `User #${log.actorUserId}`;
    return { action: log.action, actor: actorEmail };
  };

  return (
    <div className="app">
      <Topbar orgName={org?.name} />
      <div className="layout">
        <Sidebar active="home" />
        <div className="content">
          <div className="content-inner">
            <div className="greeting">Welcome back, {orgFirstName}</div>
            <div className="subtext">
              Here's what's happening in {org?.name || 'your organization'} today.
            </div>

            {error && <div className="dashboard-error">{error}</div>}

            {loading ? (
              <div className="loading-state">Loading dashboard…</div>
            ) : (
              <>
                <h2>Organization</h2>
                <div className="card org-card">
                  <div className="org-grid">
                    <div>
                      <div className="org-field-label">Organization slug</div>
                      <div className="org-field-value">{org?.slug}</div>
                    </div>
                    <div>
                      <div className="org-field-label">Created</div>
                      <div className="org-field-value">{formatDate(org?.createdAt)}</div>
                    </div>
                    <div>
                      <div className="org-field-label">Your role</div>
                      <div className="org-field-value">{currentRole}</div>
                    </div>
                    <div>
                      <div className="org-field-label">Rate limit</div>
                      <div className="org-field-value">{org?.requestLimitPerMinute} req/min</div>
                    </div>
                  </div>
                </div>

                <h2>Usage</h2>
                <div className="metrics">
                  <div className="card metric-card">
                    <div className="metric-top">
                      <div className="metric-label">Tokens remaining (org-wide)</div>
                      <button
                        className="refresh-btn"
                        onClick={refreshUsage}
                        disabled={refreshingUsage}
                      >
                        {refreshingUsage ? 'Refreshing…' : 'Refresh'}
                      </button>
                    </div>
                    <div className="metric-value">
                      {Math.round(usage?.tokensRemaining ?? 0)}
                      <span className="of"> / {usage?.limitPerMinute}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${usagePercent}%` }}></div>
                    </div>
                    <div className="bar-sub">
                      Shared across all members · refills ~{refillPerSecond}/sec ({usage?.limitPerMinute}/min)
                    </div>
                  </div>
                  <div className="card metric-card">
                    <div className="metric-top">
                      <div className="metric-label">Active members</div>
                    </div>
                    <div className="metric-value">{activeMembers}</div>
                    <div className="bar-sub">Across {distinctRoles.size} roles</div>
                  </div>
                </div>

                <div className="section-header">
                  <h2>Recent activity</h2>
                  <Link className="view-all" to="/audit-log">View all →</Link>
                </div>
                <div className="card log-card">
                  {auditLogs.length === 0 ? (
                    <div className="log-empty">No recent activity.</div>
                  ) : (
                    auditLogs.slice(0, 3).map((log) => {
                      const { action, actor } = formatActionLabel(log);
                      return (
                        <div className="log-row" key={log.id}>
                          {action} <span className="log-sep">·</span> {actor}
                          <span className="log-time">{formatTimestamp(log.timestamp)}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Home;