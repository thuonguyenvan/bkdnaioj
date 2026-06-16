import React from 'react';
import { Link } from 'react-router-dom';
import logoImage from '../../assets/image.png';

export const Footer: React.FC = () => {
  return (
    <footer className="footer-main" style={{ padding: '1.5rem 0 1rem 0' }}>
      {/* Zig-zag top border */}
      <div className="footer-zigzag" />

      <div className="container footer-grid" style={{ gap: '1.5rem' }}>
        {/* Brand/Logo Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <img src={logoImage} alt="BKDNAIOJ" width="48" height="48" style={{ flexShrink: 0, borderRadius: '6px', objectFit: 'contain' }} />
            <span className="footer-brand-title" style={{ fontSize: '1.1rem' }}>BKDNAIOJ</span>
          </div>
        </div>

        {/* Column 1: AI Contests */}
        <div>
          <h4 className="footer-col-title" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>AI Contests</h4>
          <ul className="footer-links-list" style={{ gap: '0.4rem', fontSize: '0.8rem' }}>
            <li><Link to="/contests" className="footer-link">&gt; BKDN AI Challenge</Link></li>
            <li><a href="https://kaggle.com" target="_blank" rel="noreferrer" className="footer-link">&gt; Kaggle Competitions</a></li>
            <li><Link to="/contests" className="footer-link">&gt; AI Driving Agent</Link></li>
            <li><Link to="/contests" className="footer-link">&gt; NLP Cup</Link></li>
          </ul>
        </div>

        {/* Column 2: AI Resources */}
        <div>
          <h4 className="footer-col-title" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>AI Resources</h4>
          <ul className="footer-links-list" style={{ gap: '0.4rem', fontSize: '0.8rem' }}>
            <li><Link to="/docs" className="footer-link">&gt; Platform Docs</Link></li>
            <li><Link to="/docs" className="footer-link">&gt; Volunteer Guide</Link></li>
            <li><Link to="/problems" className="footer-link">&gt; Practice Tasks</Link></li>
            <li><Link to="/rankings" className="footer-link">&gt; Leaderboards</Link></li>
          </ul>
        </div>

        {/* Column 3: Community */}
        <div>
          <h4 className="footer-col-title" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>Community</h4>
          <ul className="footer-links-list" style={{ gap: '0.4rem', fontSize: '0.8rem' }}>
            <li><a href="https://dut.udn.vn" target="_blank" rel="noreferrer" className="footer-link">&gt; Faculty of IT - DUT</a></li>
            <li><a href="https://vnoi.info" target="_blank" rel="noreferrer" className="footer-link">&gt; VNOI Forum</a></li>
          </ul>
        </div>

        {/* Column 4: Contact */}
        <div>
          <h4 className="footer-col-title" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>Contact</h4>
          <ul className="footer-links-list" style={{ gap: '0.4rem', fontSize: '0.8rem' }}>
            <li className="footer-link">&gt; Email: bkdnaioj@gmail.com</li>
            <li><a href="https://facebook.com" target="_blank" rel="noreferrer" className="footer-link">&gt; Facebook Fanpage</a></li>
            <li><a href="https://github.com" target="_blank" rel="noreferrer" className="footer-link">&gt; GitHub Org</a></li>
          </ul>
        </div>
      </div>

      {/* Footer Bottom copyright & info */}
      <div style={{
        marginTop: '1.5rem',
        textAlign: 'center',
        fontSize: '0.75rem',
        color: '#475569',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem',
        lineHeight: '1.4'
      }}>
        <div>BKDNAIOJ · AI Competition Platform</div>
        <div>© 2026 BKDN AI Challenge. All rights reserved.</div>
      </div>
    </footer>
  );
};
