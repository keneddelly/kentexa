import React from 'react';
import { reportClientError } from '../../utils/clientErrors';

// Safety net (owner approved 2026-11-15): when one page fails, it shows a short message with
// "Jaribu tena" and "Rudi Nyumbani" instead of a white screen, and the menu bar keeps working.
// `scope="app"` is the last net around the whole site: its only way out is reloading.
export default class PageErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    reportClientError({ kind: this.props.scope === 'app' ? 'app' : 'page', page: this.props.page, error });
  }

  componentDidUpdate(prev) {
    // Moving to another page gives that page a fresh start.
    if (this.state.error && prev.page !== this.props.page) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    const app = this.props.scope === 'app';
    const retry = () => {
      if (app) { window.location.reload(); return; }
      this.setState({ error: null });
    };
    const home = () => {
      if (app || !this.props.onHome) { window.location.assign('/'); return; }
      this.setState({ error: null });
      this.props.onHome();
    };
    return (
      <div role="alert" data-testid="page-error"
        style={{ minHeight: app ? '100vh' : '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 12, padding: '32px 20px', textAlign: 'center', background: '#fff', color: '#0f1419', fontFamily: 'inherit' }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Kuna tatizo kwenye ukurasa huu</div>
        <div style={{ fontSize: 14, color: '#536471', maxWidth: 320, lineHeight: 1.5 }}>
          Tumepokea taarifa ya tatizo hili. Jaribu tena, au rudi Nyumbani.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginTop: 4 }}>
          <button type="button" onClick={retry}
            style={{ background: '#0f1419', color: '#fff', border: 'none', borderRadius: 999, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            Jaribu tena
          </button>
          <button type="button" onClick={home}
            style={{ background: '#fff', color: '#0f1419', border: '1px solid #cfd9de', borderRadius: 999, padding: '10px 20px', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            Rudi Nyumbani
          </button>
        </div>
      </div>
    );
  }
}
