import { useState, useEffect, useContext } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import axiosClient from '../api/axiosClient';
import { AuthContext } from '../context/AuthContext';
import styles from './AcceptInvitation.module.css';

function AcceptInvitation() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { login } = useContext(AuthContext);

  const [screenState, setScreenState] = useState('loading'); // loading | form | invalid | success
  const [invite, setInvite] = useState(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [acceptResult, setAcceptResult] = useState(null);

  useEffect(() => {
    if (!token) {
      setScreenState('invalid');
      return;
    }
    axiosClient
      .get(`/invitations/${token}`)
      .then((res) => {
        setInvite(res.data);
        setScreenState('form');
      })
      .catch(() => {
        setScreenState('invalid');
      });
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (password !== confirmPassword) {
      setFormError("Passwords don't match.");
      return;
    }

    setSubmitting(true);
    try {
      const response = await axiosClient.post('/auth/accept-invitation', {
        token,
        password,
      });
      login(response.data.token);
      setAcceptResult(response.data);
      setScreenState('success');
    } catch (err) {
      setFormError('This invitation could not be accepted. It may have expired or already been used.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.authPage}>
      <div className={styles.authWrap}>
        <div className={styles.card}>

          {screenState === 'loading' && (
            <div className={styles.loadingState}>
              <div className={styles.spinner}></div>
              <p>Checking your invitation…</p>
            </div>
          )}

          {screenState === 'invalid' && (
            <div className={styles.invalidState}>
              <div className={styles.invalidIcon}>!</div>
              <div className={styles.title}>Invitation not valid</div>
              <div className={styles.subtitle}>
                This invitation link has expired, was already used, or doesn't exist.
                Ask your organization admin to send a new one.
              </div>
              <a className={styles.footerText} href="/login" style={{ marginTop: 0 }}>
                Back to login →
              </a>
            </div>
          )}

          {screenState === 'form' && invite && (
            <>
              <div className={styles.title}>Join your team</div>
              <div className={styles.subtitle}>
                You've been invited to join <strong>{invite.orgName}</strong> as{' '}
                <strong>{invite.roleName}</strong>.
              </div>

              <form onSubmit={handleSubmit}>
                <div className={styles.field}>
                  <label>Email</label>
                  <input type="email" value={invite.email} readOnly />
                </div>

                <div className={styles.field}>
                  <label>Password</label>
                  <div className={styles.passwordWrap}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="At least 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                    <button
                      type="button"
                      className={styles.eyeBtn}
                      onClick={() => setShowPassword((prev) => !prev)}
                      tabIndex={-1}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                          <line x1="1" y1="1" x2="23" y2="23" />
                        </svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>

                <div className={styles.field} style={{ marginBottom: formError ? '6px' : '0' }}>
                  <label>Confirm password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Re-enter password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    minLength={8}
                    required
                  />
                </div>

                {formError && <div className={styles.fieldError}>{formError}</div>}

                <button type="submit" className={styles.btnPrimary} disabled={submitting}>
                  {submitting ? 'Joining…' : 'Accept & join'}
                </button>
              </form>
            </>
          )}

          {screenState === 'success' && acceptResult && (
            <div className={styles.successState}>
              <div className={styles.checkBadge}>✓</div>
              <div className={styles.title}>You're in</div>
              <div className={styles.subtitle}>
                You've joined <strong>{acceptResult.orgName}</strong>. Remember your organization
                slug below — you'll need it every time you log in.
              </div>

              <div className={styles.slugBox}>
                <div className={styles.slugInfo}>
                  <div className={styles.slugLabel}>Organization slug</div>
                  <div className={styles.slugValue}>{acceptResult.orgSlug}</div>
                </div>
              </div>

              <button className={styles.btnPrimary} onClick={() => navigate('/home')}>
                Continue to dashboard
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default AcceptInvitation;