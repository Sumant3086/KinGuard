import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="login-page">
      <div style={{
        background: 'var(--surface)', padding: '48px 40px', borderRadius: 16,
        textAlign: 'center', maxWidth: 400, width: '92%',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>404</div>
        <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>Page Not Found</h2>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 28 }}>
          The page you are looking for does not exist.
        </p>
        <Link to="/" className="btn btn-primary">Back to Home</Link>
      </div>
    </div>
  );
}
