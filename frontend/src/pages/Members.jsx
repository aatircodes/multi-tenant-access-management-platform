import { useState, useEffect, useContext } from 'react';
import axiosClient from '../api/axiosClient';
import { AuthContext } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import styles from './Members.module.css';

function Members() {
  const { claims } = useContext(AuthContext);
  const currentUserId = claims?.userId;

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [openPopoverId, setOpenPopoverId] = useState(null);

  const [modalType, setModalType] = useState(null); // 'deactivate' | 'transfer' | null
  const [modalTarget, setModalTarget] = useState(null); // the user object
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const loadUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await axiosClient.get('/users');
      setUsers(res.data);
    } catch (err) {
      setError('Failed to load members.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    const closePopovers = () => setOpenPopoverId(null);
    document.addEventListener('click', closePopovers);
    return () => document.removeEventListener('click', closePopovers);
  }, []);

  const toggleRolePopover = (userId, e) => {
    e.stopPropagation();
    setOpenPopoverId((prev) => (prev === userId ? null : userId));
  };

  const openModal = (type, user) => {
    setModalType(type);
    setModalTarget(user);
    setModalError('');
  };

  const closeModal = () => {
    setModalType(null);
    setModalTarget(null);
    setModalError('');
  };

  const confirmModalAction = async () => {
    if (!modalTarget) return;
    setModalSubmitting(true);
    setModalError('');
    try {
      if (modalType === 'deactivate') {
        await axiosClient.patch(`/users/${modalTarget.id}/deactivate`);
      } else if (modalType === 'transfer') {
        await axiosClient.post(`/roles/transfer-admin/${modalTarget.id}`);
      }
      closeModal();
      await loadUsers();
    } catch (err) {
      const backendMessage = err.response?.data?.message;
      setModalError(backendMessage || 'Action failed. Please try again.');
    } finally {
      setModalSubmitting(false);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className={styles.app}>
      <Topbar />
      <div className={styles.layout}>
        <Sidebar active="members" />
        <div className={styles.content}>
          <div className={styles.contentInner}>
            <div className={styles.pageHeader}>
              <div>
                <div className={styles.pageTitle}>Members</div>
                <div className={styles.pageSubtitle}>
                  Everyone with access to your organization, and their assigned roles.
                </div>
              </div>
            </div>

            {error && <div className={styles.membersError}>{error}</div>}

            {loading ? (
              <div className={styles.loadingState}>Loading members…</div>
            ) : (
              <div className={styles.card}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => {
                      const isSelf = String(user.id) === String(currentUserId);
                      const isDisabled = user.status === 'DISABLED';
                      const isAdmin = user.roles.includes('Admin');
                      const [firstRole, ...restRoles] = user.roles;

                      const actionsDisabled = isSelf || isDisabled || isAdmin;
                      let disabledReason = '';
                      if (isSelf) disabledReason = 'You cannot modify your own account';
                      else if (isDisabled) disabledReason = 'This member is deactivated';
                      else if (isAdmin) disabledReason = 'This member is already the Admin';

                      return (
                        <tr key={user.id} className={isDisabled ? styles.disabledRow : ''}>
                          <td>
                            <div className={styles.userEmail}>
                              {user.email} {isSelf && <span className={styles.selfTag}>(you)</span>}
                            </div>
                            <div className={styles.userJoined}>
                              Joined {formatDate(user.createdAt)}
                            </div>
                          </td>
                          <td>
                            <div className={styles.roleTags}>
                              <span className={`${styles.roleTag} ${firstRole === 'Admin' ? styles.roleTagAdmin : ''}`}>
                                {firstRole}
                              </span>
                              {restRoles.length > 0 && (
                                <button
                                  type="button"
                                  className={styles.roleMore}
                                  onClick={(e) => toggleRolePopover(user.id, e)}
                                >
                                  +{restRoles.length} more
                                  {openPopoverId === user.id && (
                                    <div className={`${styles.roleMorePopover} ${styles.roleMorePopoverOpen}`}>
                                      {restRoles.map((role) => (
                                        <span key={role} className={styles.roleTag}>
                                          {role}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </button>
                              )}
                            </div>
                          </td>
                          <td>
                            <span
                              className={`${styles.statusBadge} ${
                                isDisabled ? styles.statusDisabled : styles.statusActive
                              }`}
                            >
                              {isDisabled ? 'Deactivated' : 'Active'}
                            </span>
                          </td>
                          <td>
                            <div className={styles.rowActions}>
                              <button
                                type="button"
                                className={styles.iconBtn}
                                disabled={actionsDisabled}
                                title={disabledReason}
                                onClick={() => openModal('transfer', user)}
                              >
                                Make Admin
                              </button>
                              <button
                                type="button"
                                className={`${styles.iconBtn} ${styles.iconBtnDanger}`}
                                disabled={actionsDisabled}
                                title={disabledReason}
                                onClick={() => openModal('deactivate', user)}
                              >
                                Deactivate
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {modalType && modalTarget && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            {modalType === 'deactivate' ? (
              <>
                <div className={styles.modalTitle}>Deactivate member</div>
                <div className={styles.modalBody}>
                  Are you sure you want to deactivate <strong>{modalTarget.email}</strong>? They
                  will lose access immediately.
                </div>
              </>
            ) : (
              <>
                <div className={styles.modalTitle}>Transfer admin rights</div>
                <div className={styles.modalBody}>
                  Make <strong>{modalTarget.email}</strong> the new Admin? You will lose Admin
                  access immediately. There can only be one Admin per organization.
                </div>
              </>
            )}

            {modalError && <div className={styles.modalError}>{modalError}</div>}

            <div className={styles.modalActions}>
              <button type="button" className={styles.btnSecondary} onClick={closeModal}>
                Cancel
              </button>
              {modalType === 'deactivate' ? (
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={confirmModalAction}
                  disabled={modalSubmitting}
                >
                  {modalSubmitting ? 'Deactivating…' : 'Deactivate'}
                </button>
              ) : (
                <button
                  type="button"
                  className={styles.btnAccent}
                  onClick={confirmModalAction}
                  disabled={modalSubmitting}
                >
                  {modalSubmitting ? 'Transferring…' : 'Transfer Admin'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Members;