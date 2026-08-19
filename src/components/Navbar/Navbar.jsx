import { useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Link, scroller } from 'react-scroll';
import { motion, useMotionValue, animate } from 'framer-motion';
import {
  HiOutlineHome, HiOutlineUser, HiOutlineSparkles,
  HiOutlineSquares2X2, HiOutlineChatBubbleLeftRight,
} from 'react-icons/hi2';
import { useScrollDirection } from '../../hooks/useScrollDirection';
import './Navbar.css';

const navItems = [
  { label: 'Home',     to: 'home',     Icon: HiOutlineHome },
  { label: 'Story',    to: 'about',    Icon: HiOutlineUser },
  { label: 'Skills',   to: 'skills',   Icon: HiOutlineSparkles },
  { label: 'Work',     to: 'projects', Icon: HiOutlineSquares2X2 },
  { label: 'Contact',  to: 'contact',  Icon: HiOutlineChatBubbleLeftRight },
];

// Genuinely critically-damped now: for stiffness 320, critical damping is
// 2*sqrt(320) ≈ 35.8. Sitting at/above that means the pill arrives at its
// target and stops — it can no longer overshoot and spring back, which is
// what read as "jumps past the tab, then returns" on a direct click.
const MOVE_SPRING = { type: 'spring', stiffness: 320, damping: 36, mass: 1 };

const SCROLL_DURATION = 500;
const SPY_SUPPRESS_MS = SCROLL_DURATION + 200;
const PILL_INSET = 4; // px gap between pill edge and slot edge, each side

export default function Navbar({ config }) {
  const [active, setActive] = useState('home');
  const resumeUrl = config?.resumeUrl || '#';
  const { direction, scrolled } = useScrollDirection();
  const tucked = scrolled && direction === 'down';

  const tabWrapRef = useRef(null);
  const dragRef = useRef({ dragging: false, startX: 0, moved: false });

  // ── Geometry, in the SAME coordinate system the pill's `left`/`x` uses.
  // A position:absolute child's origin sits just inside the ancestor's
  // border (the padding-box edge) — it does NOT skip past the ancestor's
  // own padding. `.ios-tabbar-inner` has padding + a border, so without
  // accounting for those explicitly, "index * slotWidth" silently drifted
  // further from the real slot position at every step — small at tab 0,
  // visibly lopsided by tab 4. contentWidth/originOffset below correct
  // for that once, from the actual computed styles, instead of assuming
  // the wrap's border-box width IS its usable width. ──
  const [layout, setLayout] = useState({ contentWidth: 0, originOffset: 0 });

  useLayoutEffect(() => {
    const wrap = tabWrapRef.current;
    if (!wrap) return;
    const measure = () => {
      const style = getComputedStyle(wrap);
      const paddingLeft = parseFloat(style.paddingLeft) || 0;
      const paddingRight = parseFloat(style.paddingRight) || 0;
      const borderLeft = parseFloat(style.borderLeftWidth) || 0;
      const borderRight = parseFloat(style.borderRightWidth) || 0;
      const rect = wrap.getBoundingClientRect();
      setLayout({
        contentWidth: rect.width - paddingLeft - paddingRight - borderLeft - borderRight,
        originOffset: paddingLeft, // how far past the pill's own x:0 the real content starts
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  const { contentWidth, originOffset } = layout;
  const slotWidth = contentWidth / navItems.length;
  const pillW = Math.max(slotWidth - PILL_INSET * 2, 0);

  const pillX = useMotionValue(0);
  const pillWidth = useMotionValue(64);

  const indexOf = useCallback((key) => {
    const i = navItems.findIndex(t => t.to === key);
    return i === -1 ? 0 : i;
  }, []);

  const moveToIndex = useCallback((index, animated = true) => {
    if (!slotWidth) return;
    pillWidth.set(pillW);
    const x = originOffset + index * slotWidth + PILL_INSET;
    if (animated) animate(pillX, x, MOVE_SPRING);
    else pillX.set(x);
  }, [slotWidth, pillW, originOffset, pillX, pillWidth]);

  useEffect(() => {
    if (!dragRef.current.dragging) moveToIndex(indexOf(active), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentWidth, originOffset]);

  const prevActiveRef = useRef(active);
  useEffect(() => {
    if (prevActiveRef.current !== active && !dragRef.current.dragging) {
      moveToIndex(indexOf(active), true);
    }
    prevActiveRef.current = active;
  }, [active, indexOf, moveToIndex]);

  const suppressSpyRef = useRef(false);
  const suppressTimeoutRef = useRef(null);
  const suppressSpyFor = useCallback((ms = SPY_SUPPRESS_MS) => {
    suppressSpyRef.current = true;
    if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current);
    suppressTimeoutRef.current = setTimeout(() => { suppressSpyRef.current = false; }, ms);
  }, []);
  useEffect(() => () => { if (suppressTimeoutRef.current) clearTimeout(suppressTimeoutRef.current); }, []);

  const handleSpyActive = useCallback((key) => {
    if (suppressSpyRef.current) return;
    setActive(key);
  }, []);

  const handleTabClick = useCallback((key) => {
    suppressSpyFor();
    setActive(key);
  }, [suppressSpyFor]);

  const handlePointerDown = (e) => {
    dragRef.current = { dragging: true, startX: e.clientX, moved: false };
    tabWrapRef.current?.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current.dragging || !slotWidth) return;
    if (Math.abs(e.clientX - dragRef.current.startX) > 6) dragRef.current.moved = true;
    if (!dragRef.current.moved) return;

    const wrap = tabWrapRef.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const style = getComputedStyle(wrap);
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    // Same local coordinate system the pill's x uses: origin just inside the border.
    const fingerLocal = e.clientX - wrapRect.left - borderLeft;

    const minX = originOffset + PILL_INSET;
    const maxX = originOffset + contentWidth - pillW - PILL_INSET;
    const clampedLeft = Math.max(minX, Math.min(fingerLocal - pillW / 2, maxX));

    pillWidth.set(pillW);
    pillX.set(clampedLeft);

    const contentLocalCenter = clampedLeft + pillW / 2 - originOffset;
    const nearestIndex = Math.max(0, Math.min(Math.floor(contentLocalCenter / slotWidth), navItems.length - 1));
    const nearestKey = navItems[nearestIndex].to;
    if (nearestKey !== active) setActive(nearestKey);
  };

  const handlePointerUp = () => {
    if (!dragRef.current.dragging) return;
    const wasDrag = dragRef.current.moved;
    dragRef.current.dragging = false;
    if (wasDrag) {
      suppressSpyFor();
      moveToIndex(indexOf(active), true);
      scroller.scrollTo(active, { smooth: true, duration: SCROLL_DURATION, offset: -40 });
    }
  };

  return (
    <>
      {/* Desktop floating glass pill nav */}
      <div className="ios-navbar-anchor">
        <motion.nav
          className={`ios-navbar${scrolled ? ' scrolled' : ''}`}
          initial={{ y: -60, opacity: 0 }}
          animate={{
            y: tucked ? 10 : 0,
            opacity: tucked ? 0.9 : 1,
            scale: tucked ? 0.92 : 1,
          }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        >
          <span className="ios-navbar-logo">S<span className="dot" /></span>
          <ul className="ios-navbar-items">
            {navItems.map(({ label, to, Icon }) => (
              <li key={to}>
                <Link
                  to={to} smooth duration={SCROLL_DURATION} spy offset={-90}
                  className="ios-nav-link"
                  activeClass="active"
                  onClick={() => handleTabClick(to)}
                  onSetActive={() => handleSpyActive(to)}
                >
                  <Icon />
                  <span>{label}</span>
                </Link>
              </li>
            ))}
          </ul>
          <a href={resumeUrl} target="_blank" rel="noreferrer" className="ios-navbar-cta">
            Resume
          </a>
        </motion.nav>
      </div>

      {/* Mobile floating "Liquid Glass" pill nav */}
      <motion.nav
        className="ios-tabbar"
        animate={{
          y: tucked ? 20 : 0,
          opacity: tucked ? 0.88 : 1,
          scale: tucked ? 0.94 : 1,
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      >
        <div
          className="ios-tabbar-inner"
          ref={tabWrapRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {contentWidth > 0 && (
            <motion.span
              className="tab-pill"
              style={{ x: pillX, width: pillWidth }}
            />
          )}

          {navItems.map(({ label, to, Icon }) => {
            const isActive = active === to;
            return (
              <div key={to} className="ios-tab-slot">
                <Link
                  to={to} smooth duration={SCROLL_DURATION} spy offset={-40}
                  className={`ios-tab-item${isActive ? ' tab-active' : ''}`}
                  onClick={() => handleTabClick(to)}
                  onSetActive={() => handleSpyActive(to)}
                  aria-label={label}
                >
                  <Icon className="ios-tab-icon" />
                </Link>
              </div>
            );
          })}
        </div>
      </motion.nav>
    </>
  );
}