import { useState, useEffect } from 'react';
import axiosClient from '../api/axiosClient';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import styles from './Invitations.module.css';

function Invitations() {
  const [roles, setRoles] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [roleId, setRoleId] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');

  const [visibleLinkId, setVisibleLinkId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [rolesRes, invitesRes] = await Promise.all([
        axiosClient.get('/roles'),
        axiosClient.get('/invitations'),
      ]);
      const invitableRoles = rolesRes.data.filter((r) => r.name !== 'Admin');
      setRoles(invitableRoles);
      setInvitations(invitesRes.data);
      if (invitableRoles.length > 0 && !roleId) {
        setRoleId(String(invitableRoles[0].id));
      }
    } catch (err) {
      setError('Failed to load invitations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendInvite = async (e) => {
    e.preventDefault();
    setSendError('');
    setSending(true);
    try {
      const response = await axiosClient.post('/invitations', {
        email,
        roleId,
      });
      const selectedRole = roles.find((r) => String(r.id) === String(roleId));
      setInvitations((prev) => [
        {
          id: response.data.id,
          email: response.data.email,
          roleName: selectedRole?.name || '—',
          status: 'PENDING',
          expiresAt: response.data.expiresAt,
          token: response.data.token,
        },
        ...prev,
      ]);
      setEmail('');
    } catch (err) {
      if (err.response && err.response.status === 409) {
        setSendError('This email has already been invited or is already a member.');
      } else {
        setSendError('Failed to send invitation. Please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (invitationId) => {
    setRevokingId(invitationId);
    try {
      await axiosClient.delete(`/invitations/${invitationId}`);
      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
    } catch (err) {
      setError('Failed to revoke invitation. It may have already been used or removed.');
    } finally {
      setRevokingId(null);
    }
  };

  const toggleLink = (invitationId) => {
    setVisibleLinkId((prev) => (prev === invitationId ? null : invitationId));
  };

  const copyLink = (invitationId, token) => {
    const link = `${window.location.origin}/accept-invitation?token=${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(invitationId);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const formatExpiry = (isoString) => {
    const expires = new Date(isoString);
    const now = new Date();
    const diffMs = expires - now;
    if (diffMs <= 0) return 'expired';
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    return `expires in ${diffHours}h`;
  };

  return (
    <div className={styles.app}>
      <Topbar />
      <div className={styles.layout}>
        <Sidebar active="invitations" />
        <div className={styles.content}>
          <div className={styles.contentInner}>
            <div className={styles.pageTitle}>Invitations</div>
            <div className={styles.pageSubtitle}>
              Invite new members to your organization and assign their starting role.
            </div>

            {error && <div className={styles.invitationsError}>{error}</div>}

            <div className={`${styles.card} ${styles.inviteCard}`}>
              <form className={styles.inviteRow} onSubmit={handleSendInvite}>
                <div className={styles.field}>
                  <label>Email address</label>
                  <input
                    type="email"
                    placeholder="colleague@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
                <div className={`${styles.field} ${styles.fieldRole}`}>
                  <label>Role</label>
                  <select value={roleId} onChange={(e) => setRoleId(e.target.value)} required>
                    {roles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className={styles.btnPrimary} disabled={sending || !roleId}>
                  {sending ? 'Sending…' : 'Send invite'}
                </button>
              </form>
              {sendError && <div className={styles.sendError}>{sendError}</div>}
            </div>

            <div className={styles.sectionLabel}>Pending invitations</div>
            {loading ? (
              <div className={styles.loadingState}>Loading invitations…</div>
            ) : invitations.length === 0 ? (
              <div className={styles.card}>
                <div className={styles.emptyState}>No pending invitations.</div>
              </div>
            ) : (
              <div className={`${styles.card} ${styles.inviteList}`}>
                {invitations.map((inv) => (
                  <div className={styles.inviteListRow} key={inv.id}>
                    <div className={styles.inviteListTop}>
                      <div className={styles.inviteLeft}>
                        <div className={styles.inviteEmail}>{inv.email}</div>
                        <div className={styles.inviteMeta}>
                          Invited as <span className={styles.roleTag}>{inv.roleName}</span> ·{' '}
                          {formatExpiry(inv.expiresAt)}
                        </div>
                      </div>
                      <div className={styles.inviteRight}>
                        <span className={styles.statusBadge}>Pending</span>
                        <button
                          type="button"
                          className={styles.copyLinkBtn}
                          onClick={() => toggleLink(inv.id)}
                        >
                          Copy invite link
                        </button>
                        <button
                          type="button"
                          className={styles.revokeBtn}
                          onClick={() => handleRevoke(inv.id)}
                          disabled={revokingId === inv.id}
                        >
                          {revokingId === inv.id ? 'Revoking…' : 'Revoke'}
                        </button>
                      </div>
                    </div>
                    {visibleLinkId === inv.id && (
                      inv.token ? (
                        <div className={styles.linkRow}>
                          <span className={styles.linkText}>
                            {window.location.origin}/accept-invitation?token={inv.token}
                          </span>
                          <button
                            type="button"
                            className={`${styles.copyLinkBtn} ${copiedId === inv.id ? styles.copyLinkBtnCopied : ''}`}
                            onClick={() => copyLink(inv.id, inv.token)}
                          >
                            {copiedId === inv.id ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      ) : (
                        <div className={`${styles.linkRow} ${styles.linkRowNotice}`}>
                          <span className={styles.linkTextNotice}>
                            Link no longer available for security reasons. Revoke and resend to generate a new one.
                          </span>
                        </div>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Invitations;