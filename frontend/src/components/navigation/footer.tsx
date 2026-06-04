import React from 'react';
import { Link } from 'react-router-dom';

export const Footer: React.FC = () => {
  return (
    <footer className="footer-main" style={{ padding: '1.5rem 0 1rem 0' }}>
      {/* Zig-zag top border */}
      <div className="footer-zigzag" />

      <div className="container footer-grid" style={{ gap: '1.5rem' }}>
        {/* Brand/Logo Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <svg viewBox="0 0 100 100" width="48" height="48" style={{ flexShrink: 0 }}>
              <circle cx="50" cy="50" r="46" fill="#ffffff" />
              <circle cx="50" cy="50" r="40" fill="none" stroke="#0b1329" strokeWidth="3.5" />
              <text x="50" y="44" textAnchor="middle" fill="#0b1329" fontSize="22" fontWeight="900" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">AI</text>
              <text x="50" y="68" textAnchor="middle" fill="#0b1329" fontSize="18" fontWeight="800" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">OLP</text>
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span className="footer-brand-title" style={{ fontSize: '1.1rem' }}>AI OLYMPIC</span>
              <span className="footer-brand-subtitle" style={{ fontSize: '0.75rem' }}>ONLINE JUDGE</span>
            </div>
          </div>
        </div>

        {/* Column 1: About */}
        <div>
          <h4 className="footer-col-title" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>About Us</h4>
          <ul className="footer-links-list" style={{ gap: '0.4rem', fontSize: '0.8rem' }}>
            <li><Link to="/newsfeed" className="footer-link">&gt; Introduction</Link></li>
            <li><Link to="/newsfeed" className="footer-link">&gt; Development Team</Link></li>
            <li><Link to="/newsfeed" className="footer-link">&gt; Terms of Use</Link></li>
          </ul>
        </div>

        {/* Column 2: Contests & Resources */}
        <div>
          <h4 className="footer-col-title" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>Contests & Resources</h4>
          <ul className="footer-links-list" style={{ gap: '0.4rem', fontSize: '0.8rem' }}>
            <li><a href="https://olympic.vn" target="_blank" rel="noreferrer" className="footer-link">&gt; Vietnam Informatics Olympiad</a></li>
            <li><a href="https://vnoi.info" target="_blank" rel="noreferrer" className="footer-link">&gt; VNOI Forum</a></li>
            <li><Link to="/newsfeed" className="footer-link">&gt; Participation Guide</Link></li>
          </ul>
        </div>

        {/* Column 3: Links */}
        <div>
          <h4 className="footer-col-title" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>Links</h4>
          <ul className="footer-links-list" style={{ gap: '0.4rem', fontSize: '0.8rem' }}>
            <li><a href="https://codeforces.com" target="_blank" rel="noreferrer" className="footer-link">&gt; Codeforces</a></li>
            <li><a href="https://atcoder.jp" target="_blank" rel="noreferrer" className="footer-link">&gt; AtCoder</a></li>
            <li><a href="https://dmoj.ca" target="_blank" rel="noreferrer" className="footer-link">&gt; DMOJ</a></li>
            <li><a href="https://onlinejudge.org" target="_blank" rel="noreferrer" className="footer-link">&gt; UVa Online Judge</a ></li>
          </ul>
        </div>

        {/* Column 4: Contact */}
        <div>
          <h4 className="footer-col-title" style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>Contact</h4>
          <ul className="footer-links-list" style={{ gap: '0.4rem', fontSize: '0.8rem' }}>
            <li className="footer-link">&gt; Email: contact@aiolp.vn</li>
            <li><a href="https://facebook.com" target="_blank" rel="noreferrer" className="footer-link">&gt; Facebook</a></li>
            <li><a href="https://github.com" target="_blank" rel="noreferrer" className="footer-link">&gt; GitHub</a></li>
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
        <div>aiolp v2.0 - open.Beta - 2022</div>
        <div>© 2026 AI Olympic. All rights reserved.</div>
      </div>
    </footer>
  );
};
