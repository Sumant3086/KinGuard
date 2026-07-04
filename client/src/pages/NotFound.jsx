import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="login-container">
      <div className="login-card" style={{ textAlign: 'center' }}>
        <h2>Page Not Found</h2>
        <p style={{ marginBottom: '20px' }}>The page you are looking for does not exist.</p>
        <Link to="/" className="btn btn-primary">
          Go Home
        </Link>
      </div>
    </div>
  );
}
