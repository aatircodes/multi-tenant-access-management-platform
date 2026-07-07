import { useState, useEffect, useCallback } from 'react';
import axiosClient from '../api/axiosClient';
import Topbar from '../components/Topbar';
import Sidebar from '../components/Sidebar';
import styles from './AuditLog.module.css';

const ACTION_TYPES = [
  'INVITE_SENT',
  'INVITE_REVOKED',
  'USER_JOINED',
  'USER_DEACTIVATED',
  'RESOURCE_CREATED',
  'RESOURCE_UPDATED',
  'RESOURCE_DELETED',
  'ROLE_CREATED',
  'ROLE_DELETED',
  'ROLE_ASSIGNED',
  'ROLE_UNASSIGNED',
  'PERMISSION_ASSIGNED',
  'PERMISSION_REMOVED',
  'ADMIN_TRANSFERRED',
];

function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [actorMap, setActorMap] = useState({}); // userId -> email
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination — UI is 1-indexed, API is 0-indexed
  const [uiPage, setUiPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalElements, setTotalElements] = useState(0);
  const PAGE_SIZE = 20;

  // Action filter — client-side only, filters within the currently loaded page
  // (the backend endpoint only supports page/size, no action-type param yet)
  const [actionFilter, setActionFilter] = useState('');

  const loadActorMap = useCallback(async () => {
    const result = await Promise.allSettled([axiosClient.get('/users/basic-info')]);
    if (result[0].status === 'fulfilled') {
      const map = {};
      result[0].value.data.forEach((user) => {
        map[user.id] = user.email;
      });
      setActorMap(map);
    }
  }, []);

  const loadLogs = useCallback(async (pageNumberUi) => {
    setLoading(true);
    setError('');
    try {
      const apiPage = pageNumberUi - 1; // convert to 0-indexed
      const response = await axiosClient.get('/audit-logs', {
        params: { page: apiPage, size: PAGE_SIZE },
      });
      setLogs(response.data.content);
      setTotalPages(response.data.totalPages);
      setTotalElements(response.data.totalElements);
    } catch (err) {
      setError('Failed to load audit logs. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActorMap();
  }, [loadActorMap]);

  useEffect(() => {
    loadLogs(uiPage);
  }, [uiPage, loadLogs]);

  const formatTimestamp = (isoString) => {
    if (!isoString) return '—';
    const date = new Date(isoString);
    const datePart = date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    const timePart = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${datePart} · ${timePart}`;
  };

  const displayedLogs = actionFilter
    ? logs.filter((log) => log.action === actionFilter)
    : logs;

  const startItem = totalElements === 0 ? 0 : (uiPage - 1) * PAGE_SIZE + 1;
  const endItem = Math.min(uiPage * PAGE_SIZE, totalElements);

  return (
    <div className={styles.app}>
      <Topbar />
      <div className={styles.layout}>
        <Sidebar active="audit-log" />
        <div className={styles.content}>
          <div className={styles.contentInner}>
            <div className={styles.pageHeader}>
              <div>
                <div className={styles.pageTitle}>Audit log</div>
                <div className={styles.pageSubtitle}>
                  Complete history of changes in your organization.
                </div>
              </div>
            </div>

            <div className={styles.filters}>
              <select
                className={styles.filterSelect}
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
              >
                <option value="">All actions</option>
                {ACTION_TYPES.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
            </div>

            {error && <div className={styles.formError}>{error}</div>}

            <div className={styles.card}>
              <table>
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Actor</th>
                    <th>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan="4" className={styles.emptyRow}>
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!loading && displayedLogs.length === 0 && (
                    <tr>
                      <td colSpan="4" className={styles.emptyRow}>
                        No audit log entries found.
                      </td>
                    </tr>
                  )}
                  {!loading &&
                    displayedLogs.map((log) => (
                      <tr key={log.id}>
                        <td>
                          <span className={styles.actionBadge}>{log.action}</span>
                        </td>
                        <td className={styles.entity}>
                          {log.entityType} #{log.entityId}
                        </td>
                        <td className={styles.actor}>
                          {actorMap[log.actorUserId] || `User #${log.actorUserId}`}
                        </td>
                        <td className={styles.timestamp}>
                          {formatTimestamp(log.timestamp)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {totalElements > 0 && (
              <div className={styles.pagination}>
                <div className={styles.paginationInfo}>
                  Showing <b>{startItem}–{endItem}</b> of <b>{totalElements}</b> entries
                </div>
                <div className={styles.paginationControls}>
                  <button
                    className={styles.pageBtn}
                    disabled={uiPage === 1}
                    onClick={() => setUiPage(uiPage - 1)}
                  >
                    ‹ Prev
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      className={`${styles.pageBtn} ${p === uiPage ? styles.active : ''}`}
                      onClick={() => setUiPage(p)}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    className={styles.pageBtn}
                    disabled={uiPage === totalPages}
                    onClick={() => setUiPage(uiPage + 1)}
                  >
                    Next ›
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuditLog;